<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AuditLog;
use App\Models\Correspondence;
use App\Models\CorrespondenceAttachment;
use App\Models\OperationalTask;
use App\Notifications\AdministrativeWorkAssignedNotification;
use App\Services\CorrespondenceRecipientService;
use App\Support\SafeMailHtml;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CorrespondenceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'filter' => ['nullable', Rule::in(['inbox', 'outbox', 'drafts', 'archive', 'starred', 'action'])],
            'search' => ['nullable', 'string', 'max:120'],
            'priority' => ['nullable', Rule::in(['low', 'normal', 'urgent', 'critical'])],
            'message_type' => ['nullable', Rule::in(['message', 'action', 'announcement'])],
            'date_from' => ['nullable', 'date'], 'date_to' => ['nullable', 'date'],
            'sort' => ['nullable', Rule::in(['newest', 'oldest', 'due'])],
            'page' => ['nullable', 'integer', 'min:1'], 'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        $user = $request->user();
        $filter = $data['filter'] ?? 'inbox';
        $membership = fn ($q) => $q->where('user_id', $user->id)->whereNull('deleted_at');
        $query = Correspondence::query()->with(['sender.person', 'latestMessage.sender.person', 'participants' => $membership, 'participants.user.person'])->withCount('attachments');

        if ($filter === 'outbox') {
            $query->where('sender_id', $user->id)->where('status', 'sent');
        } elseif ($filter === 'drafts') {
            $query->where('sender_id', $user->id)->where('status', 'draft');
        } elseif ($filter === 'archive') {
            $query->whereHas('participants', fn ($q) => $membership($q)->whereNotNull('archived_at'));
        } elseif ($filter === 'starred') {
            $query->where('status', 'sent')->whereHas('participants', fn ($q) => $membership($q)->whereNotNull('starred_at')->whereNull('archived_at'));
        } else {
            $query->where('status', 'sent')->whereHas('participants', fn ($q) => $membership($q)->whereNull('archived_at'))
                ->where(function ($q) use ($user) {
                    $q->whereHas('participants', fn ($p) => $p->where('user_id', $user->id)->where('participant_role', '!=', 'sender'))
                        ->orWhereHas('messages', fn ($m) => $m->where('sender_id', '!=', $user->id));
                });
            if ($filter === 'action') {
                $query->where('message_type', 'action');
            }
        }

        $query->when(isset($data['search']), function ($q) use ($data) {
            $search = trim($data['search']);
            $q->where(function ($x) use ($search) {
                $x->where('reference_number', 'like', "%{$search}%")->orWhere('subject', 'like', "%{$search}%")
                    ->orWhere('summary', 'like', "%{$search}%")
                    ->orWhereHas('sender', fn ($u) => $u->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"))
                    ->orWhereHas('participants.user', fn ($u) => $u->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"))
                    ->orWhereHas('participants.user.person', fn ($p) => $p->where('full_name_ar', 'like', "%{$search}%")->orWhere('full_name_en', 'like', "%{$search}%"));
            });
        })->when(isset($data['priority']), fn ($q) => $q->where('priority', $data['priority']))
            ->when(isset($data['message_type']), fn ($q) => $q->where('message_type', $data['message_type']))
            ->when(isset($data['date_from']), fn ($q) => $q->whereDate('correspondence_date', '>=', $data['date_from']))
            ->when(isset($data['date_to']), fn ($q) => $q->whereDate('correspondence_date', '<=', $data['date_to']));

        match ($data['sort'] ?? 'newest') {
            'oldest' => $query->orderBy('last_message_at')->orderBy('id'),
            'due' => $query->orderByRaw('response_due_date IS NULL')->orderBy('response_due_date')->orderByDesc('last_message_at'),
            default => $query->orderByDesc('last_message_at')->orderByDesc('id'),
        };

        $items = $query->paginate($data['per_page'] ?? 25);
        $items->getCollection()->each(function (Correspondence $item) use ($user) {
            $state = $item->participants->firstWhere('user_id', $user->id);
            $item->setAttribute('viewer_state', $state);
            $item->setAttribute('mail_unread', $this->isUnread($item, $state, $user->id));
            $recipientQuery = $item->participants()->with('user.person')->where('participant_role', '!=', 'sender');
            if ($item->sender_id !== $user->id) {
                $recipientQuery->where(fn ($q) => $q->where('participant_role', '!=', 'fyi')->orWhere('user_id', $user->id));
            }
            $item->setAttribute('recipient_names', $recipientQuery->get()->map(fn ($p) => $p->user?->person?->full_name_ar ?: $p->user?->name)->filter()->values());
        });

        return ApiResponse::success($items->items(), null, $this->mailboxMeta($user->id) + [
            'current_page' => $items->currentPage(), 'last_page' => $items->lastPage(), 'per_page' => $items->perPage(), 'total' => $items->total(),
        ]);
    }

    public function show(Request $request, Correspondence $correspondence): JsonResponse
    {
        $participant = $this->participant($correspondence, $request->user()->id);
        if ($this->isUnread($correspondence, $participant, $request->user()->id)) {
            $participant->update(['read_at' => now()]);
            $this->audit($request, $correspondence, 'correspondence.read');
        }

        return ApiResponse::success($this->mail($correspondence, $request->user()->id));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $recipients = $this->recipientMap($request, $request->user()->id, false);
        $sendNow = (bool) ($data['send_now'] ?? $request->filled('assigned_to'));
        if ($sendNow && ! Gate::forUser($request->user())->allows('permission', ['correspondence.submit'])) {
            throw new AuthorizationException($this->tr('يمكنك حفظ المسودة، لكن لا تملك صلاحية إرسال المراسلات.', 'You may save drafts but cannot send mail.'));
        }
        if ($sendNow && empty($recipients['to'])) {
            throw ValidationException::withMessages(['to' => [$this->tr('يجب اختيار مستلم واحد على الأقل.', 'Choose at least one recipient.')]]);
        }

        $item = DB::transaction(function () use ($request, $data, $recipients, $sendNow) {
            $item = Correspondence::create([
                'reference_number' => 'MAIL-'.now()->format('Ymd').'-'.Str::upper(Str::random(6)), 'direction' => 'internal',
                'category' => $data['category'] ?? 'general', 'message_type' => $data['message_type'] ?? 'message',
                'confidentiality' => $data['confidentiality'] ?? 'normal', 'tags' => $data['tags'] ?? null,
                'subject' => trim($data['subject']), 'summary' => SafeMailHtml::clean($data['body'] ?? $data['summary'] ?? null), 'correspondence_date' => $data['correspondence_date'] ?? now()->toDateString(),
                'response_due_date' => $data['response_due_date'] ?? null, 'priority' => $data['priority'] ?? 'normal',
                'sender_id' => $request->user()->id, 'assigned_to' => $recipients['to'][0] ?? null,
                'status' => $sendNow ? 'sent' : 'draft', 'submitted_at' => $sendNow ? now() : null, 'last_message_at' => now(),
            ]);
            $this->syncParticipants($item, $request->user()->id, $recipients, $sendNow);
            $this->audit($request, $item, $sendNow ? 'correspondence.sent' : 'correspondence.draft_created', ['recipients' => $recipients]);

            return $item;
        });
        if ($sendNow) {
            $this->notifyRecipients($item, 'correspondence');
        }

        return ApiResponse::success($this->mail($item), $this->tr($sendNow ? 'تم إرسال الرسالة.' : 'تم حفظ المسودة.', $sendNow ? 'Message sent.' : 'Draft saved.'), [], 201);
    }

    public function update(Request $request, Correspondence $correspondence): JsonResponse
    {
        $this->ensureDraftOwner($request, $correspondence);
        $data = $request->validate($this->rules());
        $recipients = $this->recipientMap($request, $request->user()->id, false);
        $correspondence->update(['category' => $data['category'] ?? 'general', 'message_type' => $data['message_type'] ?? 'message', 'confidentiality' => $data['confidentiality'] ?? 'normal', 'tags' => $data['tags'] ?? null, 'subject' => trim($data['subject']), 'summary' => SafeMailHtml::clean($data['body'] ?? null), 'priority' => $data['priority'] ?? 'normal', 'response_due_date' => $data['response_due_date'] ?? null, 'assigned_to' => $recipients['to'][0] ?? null]);
        $this->syncParticipants($correspondence, $request->user()->id, $recipients, false);
        $this->audit($request, $correspondence, 'correspondence.draft_updated');

        return ApiResponse::success($this->mail($correspondence), $this->tr('تم تحديث المسودة.', 'Draft updated.'));
    }

    public function submit(Request $request, Correspondence $correspondence): JsonResponse
    {
        $this->ensureDraftOwner($request, $correspondence);
        $data = $request->validate($this->rules());
        $recipients = $this->recipientMap($request, $request->user()->id, true);
        $correspondence->update(['subject' => trim($data['subject']), 'summary' => SafeMailHtml::clean($data['body'] ?? null), 'priority' => $data['priority'] ?? 'normal', 'message_type' => $data['message_type'] ?? 'message', 'response_due_date' => $data['response_due_date'] ?? null, 'assigned_to' => $recipients['to'][0], 'status' => 'sent', 'submitted_at' => now(), 'last_message_at' => now()]);
        $this->syncParticipants($correspondence, $request->user()->id, $recipients, true);
        $this->audit($request, $correspondence, 'correspondence.sent', ['recipients' => $recipients]);
        $this->notifyRecipients($correspondence, 'correspondence');

        return ApiResponse::success($this->mail($correspondence), $this->tr('تم إرسال الرسالة.', 'Message sent.'));
    }

    public function storeMessage(Request $request, Correspondence $correspondence): JsonResponse
    {
        $viewer = $this->participant($correspondence, $request->user()->id);
        if ($correspondence->status !== 'sent') {
            throw ValidationException::withMessages(['body' => [$this->tr('لا يمكن الرد على هذه المسودة.', 'This draft cannot receive replies.')]]);
        }
        $data = $request->validate(['body' => ['required', 'string', 'max:20000']]);
        $message = DB::transaction(function () use ($request, $correspondence, $viewer, $data) {
            $recipientId = $request->user()->id === $correspondence->sender_id
                ? $correspondence->participants()->where('participant_role', 'to')->value('user_id')
                : $correspondence->sender_id;
            $message = $correspondence->messages()->create(['sender_id' => $request->user()->id, 'recipient_id' => $recipientId, 'body' => SafeMailHtml::clean($data['body'])]);
            $now = now();
            $correspondence->update(['last_message_at' => $now]);
            $correspondence->participants()->where('user_id', '!=', $request->user()->id)->update(['read_at' => null, 'archived_at' => null]);
            $viewer->update(['read_at' => $now, 'archived_at' => null]);
            $this->audit($request, $correspondence, 'correspondence.replied', ['message_id' => $message->id]);

            return $message;
        });
        $this->notifyRecipients($correspondence, 'correspondence_reply', $request->user()->id);

        return ApiResponse::success($message->load('sender.person'), $this->tr('تم إرسال الرد.', 'Reply sent.'), [], 201);
    }

    public function forward(Request $request, Correspondence $correspondence): JsonResponse
    {
        $this->participant($correspondence, $request->user()->id);
        $recipients = $this->recipientMap($request, $request->user()->id, true);
        $body = trim((string) $request->input('body', $request->input('notes', '')));
        DB::transaction(function () use ($request, $correspondence, $recipients, $body) {
            foreach ($recipients as $role => $ids) {
                foreach ($ids as $id) {
                    $correspondence->participants()->updateOrCreate(['user_id' => $id], ['participant_role' => $role, 'read_at' => null, 'archived_at' => null, 'deleted_at' => null]);
                }
            }
            if ($body !== '') {
                $correspondence->messages()->create(['sender_id' => $request->user()->id, 'body' => SafeMailHtml::clean($body)]);
            }
            $correspondence->update(['last_message_at' => now()]);
            $this->audit($request, $correspondence, 'correspondence.forwarded', ['recipients' => $recipients]);
        });
        $this->notifyRecipients($correspondence, 'correspondence', $request->user()->id, collect($recipients)->flatten()->all());

        return ApiResponse::success($this->mail($correspondence), $this->tr('تمت إعادة توجيه الرسالة.', 'Message forwarded.'));
    }

    public function setMailboxState(Request $request, Correspondence $correspondence, string $action): JsonResponse
    {
        $participant = $this->participant($correspondence, $request->user()->id);
        if (! in_array($action, ['archive', 'restore', 'star', 'unstar', 'unread'], true)) {
            abort(404);
        }
        $participant->update(match ($action) {
            'archive' => ['archived_at' => now()], 'restore' => ['archived_at' => null], 'star' => ['starred_at' => now()], 'unstar' => ['starred_at' => null], 'unread' => ['read_at' => null]
        });
        $this->audit($request, $correspondence, 'correspondence.'.$action);

        return ApiResponse::success($participant->fresh(), $this->tr('تم تحديث الرسالة.', 'Message updated.'));
    }

    public function storeAttachment(Request $request, Correspondence $correspondence): JsonResponse
    {
        $this->participant($correspondence, $request->user()->id);
        $request->validate(['files' => ['required_without:file', 'array', 'max:10'], 'files.*' => ['file', 'max:10240', 'mimes:pdf,doc,docx,xls,xlsx,ppt,pptx,png,jpg,jpeg'], 'file' => ['required_without:files', 'file', 'max:10240', 'mimes:pdf,doc,docx,xls,xlsx,ppt,pptx,png,jpg,jpeg']]);
        $files = $request->file('files', []);
        if ($request->file('file')) {
            $files[] = $request->file('file');
        } $created = [];
        foreach ($files as $file) {
            $path = $file->storeAs("correspondence/{$correspondence->id}", Str::uuid().'.'.strtolower($file->getClientOriginalExtension()), 'local');
            $created[] = $correspondence->attachments()->create(['uploaded_by' => $request->user()->id, 'original_name' => $file->getClientOriginalName(), 'stored_path' => $path, 'mime_type' => $file->getMimeType(), 'file_size' => $file->getSize()])->load('uploader.person');
        }
        $this->audit($request, $correspondence, 'correspondence.attachments_added', ['count' => count($created)]);
        $payload = $request->file('file') && count($created) === 1 ? $created[0] : $created;

        return ApiResponse::success($payload, $this->tr('تم رفع المرفقات.', 'Attachments uploaded.'), [], 201);
    }

    public function downloadAttachment(Request $request, Correspondence $correspondence, CorrespondenceAttachment $attachment)
    {
        $this->participant($correspondence, $request->user()->id);
        abort_unless($attachment->correspondence_id === $correspondence->id && Storage::disk('local')->exists($attachment->stored_path), 404);

        return Storage::disk('local')->download($attachment->stored_path, $attachment->original_name);
    }

    public function destroyAttachment(Request $request, Correspondence $correspondence, CorrespondenceAttachment $attachment): JsonResponse
    {
        $this->participant($correspondence, $request->user()->id);
        abort_unless($attachment->correspondence_id === $correspondence->id, 404);
        if ($attachment->uploaded_by !== $request->user()->id && $correspondence->sender_id !== $request->user()->id) {
            throw new AuthorizationException($this->tr('غير مصرح بهذا الإجراء.', 'This action is unauthorized.'));
        }
        Storage::disk('local')->delete($attachment->stored_path);
        $attachment->delete();
        $this->audit($request, $correspondence, 'correspondence.attachment_deleted', ['attachment_id' => $attachment->id]);

        return ApiResponse::success(null, $this->tr('تم حذف المرفق.', 'Attachment deleted.'));
    }

    public function createTask(Request $request, Correspondence $correspondence): JsonResponse
    {
        $this->participant($correspondence, $request->user()->id);
        $data = $request->validate(['title' => ['required', 'string', 'max:255'], 'description' => ['nullable', 'string', 'max:5000'], 'assigned_to' => ['required', 'exists:users,id'], 'due_date' => ['nullable', 'date'], 'priority' => ['required', Rule::in(['low', 'normal', 'high'])]]);
        $task = OperationalTask::create($data + ['created_by' => $request->user()->id, 'source_type' => Correspondence::class, 'source_id' => $correspondence->id]);
        $task->assignee?->notify(new AdministrativeWorkAssignedNotification('task', $task->id, $task->title));

        return ApiResponse::success($task->load(['assignee.person', 'creator.person']), $this->tr('تم إنشاء المهمة.', 'Task created.'), [], 201);
    }

    public function printPdf(Request $request, Correspondence $correspondence)
    {
        $this->participant($correspondence, $request->user()->id);
        $item = $this->mail($correspondence, $request->user()->id);

        return Pdf::loadView('reports.correspondence', ['item' => $item, 'locale' => app()->getLocale()])->setPaper('a4')->download('correspondence-'.$item->reference_number.'.pdf');
    }

    private function rules(): array
    {
        return ['subject' => ['required', 'string', 'max:500'], 'body' => ['nullable', 'string', 'max:20000'], 'summary' => ['nullable', 'string', 'max:20000'], 'correspondence_date' => ['nullable', 'date'], 'direction' => ['nullable', Rule::in(['incoming', 'outgoing', 'internal'])], 'assigned_to' => ['nullable', 'integer', 'exists:users,id'], 'category' => ['nullable', Rule::in(['general', 'request', 'decision', 'complaint', 'circular'])], 'message_type' => ['nullable', Rule::in(['message', 'action', 'announcement'])], 'confidentiality' => ['nullable', Rule::in(['normal', 'confidential'])], 'tags' => ['nullable', 'array', 'max:10'], 'tags.*' => ['string', 'max:40'], 'priority' => ['nullable', Rule::in(['low', 'normal', 'urgent', 'critical'])], 'response_due_date' => ['nullable', 'date'], 'send_now' => ['nullable', 'boolean'], 'to' => ['nullable', 'array', 'max:250'], 'cc' => ['nullable', 'array', 'max:250'], 'fyi' => ['nullable', 'array', 'max:250'], 'to.*' => ['integer', 'exists:users,id'], 'cc.*' => ['integer', 'exists:users,id'], 'fyi.*' => ['integer', 'exists:users,id']];
    }

    private function recipientMap(Request $request, int $senderId, bool $toRequired): array
    {
        $to = $request->input('to', []);
        if (empty($to) && $request->filled('assigned_to')) {
            $to = [$request->integer('assigned_to')];
        }
        $map = ['to' => array_values(array_unique(array_map('intval', $to))), 'cc' => array_values(array_unique(array_map('intval', $request->input('cc', [])))), 'fyi' => array_values(array_unique(array_map('intval', $request->input('fyi', []))))];
        $seen = [$senderId => true];
        foreach ($map as &$ids) {
            $ids = array_values(array_filter($ids, function ($id) use (&$seen, $request) {
                if (isset($seen[$id])) {
                    return false;
                } app(CorrespondenceRecipientService::class)->validate($request->user(), $id);
                $seen[$id] = true;

                return true;
            }));
        }
        if ($toRequired && empty($map['to'])) {
            throw ValidationException::withMessages(['to' => [$this->tr('يجب اختيار مستلم واحد على الأقل.', 'Choose at least one recipient.')]]);
        }

        return $map;
    }

    private function syncParticipants(Correspondence $item, int $senderId, array $recipients, bool $sent): void
    {
        $item->participants()->delete();
        $item->participants()->create(['user_id' => $senderId, 'participant_role' => 'sender', 'read_at' => now()]);
        foreach ($recipients as $role => $ids) {
            foreach ($ids as $id) {
                $item->participants()->create(['user_id' => $id, 'participant_role' => $role, 'read_at' => $sent ? null : now()]);
            }
        }
    }

    private function participant(Correspondence $item, int $userId)
    {
        $participant = $item->participants()->where('user_id', $userId)->whereNull('deleted_at')->first();
        if (! $participant) {
            throw new AuthorizationException($this->tr('لا يمكنك الوصول إلى هذه الرسالة.', 'You cannot access this message.'));
        }

        return $participant;
    }

    private function ensureDraftOwner(Request $request, Correspondence $item): void
    {
        if ($item->sender_id !== $request->user()->id || $item->status !== 'draft') {
            throw new AuthorizationException($this->tr('يمكن للمرسل تعديل مسودته فقط.', 'Only the sender may edit a draft.'));
        }
    }

    private function isUnread(Correspondence $item, $state, int $userId): bool
    {
        return $item->status === 'sent' && (! $state?->read_at || ($item->last_message_at && $item->last_message_at->gt($state->read_at)));
    }

    private function mailboxMeta(int $userId): array
    {
        $base = fn () => Correspondence::where('status', 'sent')
            ->whereHas('participants', fn ($q) => $q->where('user_id', $userId)->whereNull('deleted_at')->whereNull('archived_at'))
            ->where(function ($q) use ($userId) {
                $q->whereHas('participants', fn ($p) => $p->where('user_id', $userId)->where('participant_role', '!=', 'sender'))->orWhereHas('messages', fn ($m) => $m->where('sender_id', '!=', $userId));
            });
        $unread = $base()->whereHas('participants', fn ($q) => $q->where('user_id', $userId)->where(fn ($r) => $r->whereNull('read_at')->orWhereColumn('read_at', '<', 'correspondence.last_message_at')))->count();

        return ['unread' => $unread, 'inbox' => $base()->count(), 'action' => $base()->where('message_type', 'action')->count(), 'drafts' => Correspondence::where('sender_id', $userId)->where('status', 'draft')->count(), 'starred' => Correspondence::whereHas('participants', fn ($q) => $q->where('user_id', $userId)->whereNotNull('starred_at')->whereNull('archived_at')->whereNull('deleted_at'))->count()];
    }

    private function notifyRecipients(Correspondence $item, string $type, ?int $except = null, ?array $only = null): void
    {
        $users = $item->participants()->with('user')->where('participant_role', '!=', 'sender')->get()->pluck('user')->filter()->unique('id');
        foreach ($users as $user) {
            if ($user->id !== $except && ($only === null || in_array($user->id, $only, true))) {
                $user->notify(new AdministrativeWorkAssignedNotification($type, $item->id, $item->subject));
            }
        }
    }

    private function mail(Correspondence $item, ?int $viewerId = null): Correspondence
    {
        $item = $item->fresh()->load(['sender.person', 'participants.user.person', 'attachments.uploader.person', 'messages.sender.person']);
        $item->setAttribute('summary', SafeMailHtml::clean($item->summary));
        $item->messages->each(fn ($message) => $message->setAttribute('body', SafeMailHtml::clean($message->body)));
        if ($viewerId !== null && $viewerId !== $item->sender_id) {
            $item->setRelation('participants', $item->participants->filter(
                fn ($participant) => $participant->participant_role !== 'fyi' || $participant->user_id === $viewerId
            )->values());
        }
        $item->setAttribute('activity', AuditLog::with('user.person')->where('entity_type', Correspondence::class)->where('entity_id', $item->id)->oldest()->get());

        return $item;
    }

    private function audit(Request $request, Correspondence $item, string $action, array $changes = []): void
    {
        AuditLog::create(['user_id' => $request->user()->id, 'action' => $action, 'entity_type' => Correspondence::class, 'entity_id' => $item->id, 'changes' => $changes]);
    }

    private function tr(string $ar, string $en): string
    {
        return app()->getLocale() === 'ar' ? $ar : $en;
    }
}

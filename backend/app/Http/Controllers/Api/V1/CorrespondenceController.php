<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Correspondence;
use App\Models\CorrespondenceAttachment;
use App\Models\OperationalTask;
use App\Notifications\AdministrativeWorkAssignedNotification;
use App\Services\CorrespondenceRecipientService;
use App\Services\WorkflowTransitionService;
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
        $user = $request->user();
        $query = Correspondence::query()->with(['sender.person', 'assignee.person']);
        $filter = $request->string('filter')->toString();

        if ($filter === 'inbox') {
            $query->where('assigned_to', $user->id)->whereNotIn('status', ['draft', 'closed']);
        } elseif ($filter === 'outbox') {
            $query->where('sender_id', $user->id);
        } elseif (! $this->canManageAll($user)) {
            $query->whereHas('participants', fn ($q) => $q->where('user_id', $user->id));
        }

        $query
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = trim($request->string('search')->toString());
                $q->where(fn ($x) => $x->where('reference_number', 'like', "%{$search}%")
                    ->orWhere('subject', 'like', "%{$search}%")
                    ->orWhere('counterparty', 'like', "%{$search}%"));
            })
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('priority'), fn ($q) => $q->where('priority', $request->string('priority')))
            ->when($request->filled('direction'), fn ($q) => $q->where('direction', $request->string('direction')));

        $items = $query->orderByDesc('correspondence_date')->orderByDesc('id')
            ->paginate(min($request->integer('per_page', 25), 100));

        return ApiResponse::success($items->items(), null, [
            'current_page' => $items->currentPage(), 'last_page' => $items->lastPage(), 'total' => $items->total(),
            'unread' => Correspondence::where('assigned_to', $user->id)->whereNull('read_at')->whereNotIn('status', ['draft', 'closed'])->count(),
        ]);
    }

    public function show(Request $request, Correspondence $correspondence): JsonResponse
    {
        $this->ensureVisible($request, $correspondence);
        if ($correspondence->assigned_to === $request->user()->id && ! $correspondence->read_at) {
            $correspondence->update(['read_at' => now()]);
        }
        return ApiResponse::success($correspondence->fresh()->load([
            'sender.person', 'assignee.person', 'closer.person', 'transitions.user.person', 'attachments.uploader.person',
        ]));
    }

    public function store(Request $request, WorkflowTransitionService $workflow): JsonResponse
    {
        $data = $request->validate($this->rules());
        $data['reference_number'] ??= 'COR-'.now()->format('Ymd').'-'.Str::upper(Str::random(6));
        $data['sender_id'] = $request->user()->id;
        $assignedTo = $data['assigned_to'] ?? null;
        if ($assignedTo && ! Gate::forUser($request->user())->allows('permission', ['correspondence.submit'])) {
            throw new AuthorizationException('You may create drafts but do not have permission to send correspondence.');
        }
        if ($assignedTo) app(CorrespondenceRecipientService::class)->validate($request->user(), (int) $assignedTo);
        unset($data['assigned_to']);

        $correspondence = DB::transaction(function () use ($data, $assignedTo, $workflow) {
            $item = Correspondence::create($data);
            $this->addParticipant($item, (int) $data['sender_id'], 'sender');
            if ($assignedTo) {
                $item->update(['assigned_to' => $assignedTo, 'submitted_at' => now()]);
                $this->addParticipant($item, (int) $assignedTo, 'recipient');
                $item = $workflow->transition($item->fresh(), 'submitted', 'Initial dispatch');
            }
            return $item;
        });
        $this->notifyAssignee($correspondence, 'correspondence');
        return ApiResponse::success($correspondence->load(['sender.person', 'assignee.person']), 'Correspondence created.', [], 201);
    }

    public function update(Request $request, Correspondence $correspondence): JsonResponse
    {
        if ($correspondence->sender_id !== $request->user()->id || ! in_array($correspondence->status, ['draft', 'returned'], true)) {
            throw new AuthorizationException('Only the sender may edit a draft or returned correspondence.');
        }
        $correspondence->update($request->validate($this->rules($correspondence)));
        return ApiResponse::success($correspondence->fresh(), 'Correspondence updated.');
    }

    public function submit(Request $request, Correspondence $correspondence, WorkflowTransitionService $workflow): JsonResponse
    {
        if ($correspondence->sender_id !== $request->user()->id) {
            throw new AuthorizationException('Only the sender may submit this correspondence.');
        }
        $data = $request->validate(['assigned_to' => ['required', 'exists:users,id'], 'notes' => ['nullable', 'string', 'max:2000']]);
        app(CorrespondenceRecipientService::class)->validate($request->user(), (int) $data['assigned_to']);
        $correspondence->update(['assigned_to' => $data['assigned_to'], 'submitted_at' => now(), 'read_at' => null]);
        $this->addParticipant($correspondence, (int) $data['assigned_to'], 'recipient');
        $correspondence = $workflow->transition($correspondence->fresh(), 'submitted', $data['notes'] ?? null);
        $this->notifyAssignee($correspondence, 'correspondence');
        return ApiResponse::success($correspondence->fresh(), 'Correspondence submitted.');
    }

    public function forward(Request $request, Correspondence $correspondence, WorkflowTransitionService $workflow): JsonResponse
    {
        $this->ensureAssignedOrSender($request, $correspondence);
        $data = $request->validate(['assigned_to' => ['required', 'exists:users,id'], 'notes' => ['nullable', 'string', 'max:2000']]);
        app(CorrespondenceRecipientService::class)->validate($request->user(), (int) $data['assigned_to']);
        if (in_array($correspondence->status, ['draft', 'returned'], true)) {
            return $this->submit($request, $correspondence, $workflow);
        }
        if (! in_array($correspondence->status, ['submitted', 'under_review'], true)) {
            throw ValidationException::withMessages(['status' => ['This correspondence cannot be forwarded in its current state.']]);
        }
        if ($correspondence->status === 'submitted') {
            $correspondence = $workflow->transition($correspondence, 'under_review', $data['notes'] ?? 'Forwarded');
        }
        $correspondence->update(['assigned_to' => $data['assigned_to'], 'read_at' => null]);
        $this->addParticipant($correspondence, (int) $data['assigned_to'], 'recipient');
        $this->notifyAssignee($correspondence, 'correspondence');
        return ApiResponse::success($correspondence->fresh()->load('assignee.person'), 'Correspondence forwarded.');
    }

    public function returnCorrespondence(Request $request, Correspondence $correspondence, WorkflowTransitionService $workflow): JsonResponse
    {
        $this->ensureAssignedOrManager($request, $correspondence);
        $data = $request->validate(['reason' => ['required', 'string', 'max:2000']]);
        $correspondence = $workflow->transition($correspondence, 'returned', $data['reason']);
        $correspondence->update(['assigned_to' => $correspondence->sender_id, 'returned_at' => now(), 'read_at' => null]);
        $this->addParticipant($correspondence, (int) $correspondence->sender_id, 'sender');
        $this->notifyAssignee($correspondence, 'correspondence_returned');
        return ApiResponse::success($correspondence->fresh(), 'Correspondence returned.');
    }

    public function approve(Request $request, Correspondence $correspondence, WorkflowTransitionService $workflow): JsonResponse
    {
        $this->ensureAssignedOrManager($request, $correspondence);
        $correspondence = $workflow->transition($correspondence, 'approved');
        $correspondence->update(['approved_at' => now()]);
        return ApiResponse::success($correspondence->fresh(), 'Correspondence approved.');
    }

    public function close(Request $request, Correspondence $correspondence, WorkflowTransitionService $workflow): JsonResponse
    {
        $data = $request->validate(['notes' => ['nullable', 'string', 'max:2000']]);
        if (! $this->canManageAll($request->user()) && $correspondence->sender_id !== $request->user()->id) {
            throw new AuthorizationException('This action is unauthorized.');
        }
        $correspondence = $workflow->transition($correspondence, 'closed', $data['notes'] ?? null);
        $correspondence->update(['closed_at' => now(), 'closed_by' => $request->user()->id, 'close_notes' => $data['notes'] ?? null]);
        return ApiResponse::success($correspondence->fresh(), 'Correspondence closed.');
    }

    public function createTask(Request $request, Correspondence $correspondence): JsonResponse
    {
        $this->ensureVisible($request, $correspondence);
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'], 'description' => ['nullable', 'string', 'max:5000'],
            'assigned_to' => ['required', 'exists:users,id'], 'due_date' => ['nullable', 'date'],
            'priority' => ['required', Rule::in(['low', 'normal', 'high'])],
        ]);
        $task = OperationalTask::create($data + [
            'created_by' => $request->user()->id, 'source_type' => Correspondence::class, 'source_id' => $correspondence->id,
        ]);
        $task->assignee?->notify(new AdministrativeWorkAssignedNotification('task', $task->id, $task->title));
        return ApiResponse::success($task->load(['assignee.person', 'creator.person']), 'Task created from correspondence.', [], 201);
    }

    public function storeAttachment(Request $request, Correspondence $correspondence): JsonResponse
    {
        $this->ensureVisible($request, $correspondence);
        if ($correspondence->status === 'closed') {
            throw ValidationException::withMessages(['file' => ['Closed correspondence cannot accept new attachments.']]);
        }
        $request->validate(['file' => ['required', 'file', 'max:10240', 'mimes:pdf,doc,docx,xls,xlsx,png,jpg,jpeg']]);
        $file = $request->file('file');
        $name = Str::uuid().'.'.strtolower($file->getClientOriginalExtension());
        $path = $file->storeAs("correspondence/{$correspondence->id}", $name, 'local');
        $attachment = $correspondence->attachments()->create([
            'uploaded_by' => $request->user()->id, 'original_name' => $file->getClientOriginalName(),
            'stored_path' => $path, 'mime_type' => $file->getMimeType(), 'file_size' => $file->getSize(),
        ]);
        return ApiResponse::success($attachment->load('uploader.person'), 'Attachment uploaded.', [], 201);
    }

    public function downloadAttachment(Request $request, Correspondence $correspondence, CorrespondenceAttachment $attachment)
    {
        $this->ensureVisible($request, $correspondence);
        abort_unless($attachment->correspondence_id === $correspondence->id, 404);
        abort_unless(Storage::disk('local')->exists($attachment->stored_path), 404);
        return Storage::disk('local')->download($attachment->stored_path, $attachment->original_name);
    }

    public function destroyAttachment(Request $request, Correspondence $correspondence, CorrespondenceAttachment $attachment): JsonResponse
    {
        $this->ensureVisible($request, $correspondence);
        abort_unless($attachment->correspondence_id === $correspondence->id, 404);
        if ($attachment->uploaded_by !== $request->user()->id && ! $this->canManageAll($request->user())) {
            throw new AuthorizationException('This action is unauthorized.');
        }
        Storage::disk('local')->delete($attachment->stored_path);
        $attachment->delete();
        return ApiResponse::success(null, 'Attachment deleted.');
    }

    private function rules(?Correspondence $item = null): array
    {
        return [
            'reference_number' => ['nullable', 'string', 'max:100', Rule::unique('correspondence', 'reference_number')->ignore($item?->id)],
            'direction' => ['required', Rule::in(['incoming', 'outgoing', 'internal'])],
            'category' => ['nullable', Rule::in(['general', 'request', 'decision', 'complaint', 'circular'])],
            'subject' => ['required', 'string', 'max:500'], 'counterparty' => ['nullable', 'string', 'max:255'],
            'correspondence_date' => ['required', 'date'], 'response_due_date' => ['nullable', 'date', 'after_or_equal:correspondence_date'],
            'summary' => ['nullable', 'string', 'max:10000'],
            'priority' => ['nullable', Rule::in(['low', 'normal', 'urgent', 'critical'])], 'assigned_to' => ['nullable', 'exists:users,id'],
        ];
    }

    private function ensureVisible(Request $request, Correspondence $item): void
    {
        if (! $this->isParticipant($item, $request->user()->id) && ! $this->canManageAll($request->user())) {
            throw new AuthorizationException('This action is unauthorized.');
        }
    }
    private function ensureAssignedOrSender(Request $request, Correspondence $item): void
    {
        if (! $this->isParticipant($item, $request->user()->id) && ! $this->canManageAll($request->user())) {
            throw new AuthorizationException('This action is unauthorized.');
        }
    }
    private function ensureAssignedOrManager(Request $request, Correspondence $item): void
    {
        if ($item->assigned_to !== $request->user()->id && ! $this->canManageAll($request->user())) {
            throw new AuthorizationException('This action is unauthorized.');
        }
    }
    private function canManageAll($user): bool
    {
        return Gate::forUser($user)->allows('permission', ['correspondence.approve'])
            || Gate::forUser($user)->allows('permission', ['correspondence.close']);
    }
    private function notifyAssignee(Correspondence $item, string $type): void
    {
        $item->loadMissing('assignee');
        $item->assignee?->notify(new AdministrativeWorkAssignedNotification($type, $item->id, $item->subject));
    }
    private function isParticipant(Correspondence $item, int $userId): bool
    {
        return $item->sender_id === $userId || $item->assigned_to === $userId
            || $item->participants()->where('user_id', $userId)->exists();
    }
    private function addParticipant(Correspondence $item, int $userId, string $role): void
    {
        $item->participants()->firstOrCreate(['user_id' => $userId], ['participant_role' => $role]);
    }
}

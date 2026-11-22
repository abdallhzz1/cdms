<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\{AuditLog, SupervisorFollowupRecord, SupervisorFollowupFile, User};
use App\Services\{ClinicalSupervisorAccess, SecureFileUploadService};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Validation\ValidationException;

class SupervisorFollowupController extends Controller
{
    public function __construct(private readonly ClinicalSupervisorAccess $access) {}

    private function staff(User $actor): bool
    {
        return collect(['view', 'create', 'review', 'delete'])->contains(fn ($action) => $this->access->can($actor, 'supervisor_records.'.$action));
    }

    public function index(Request $request)
    {
        $data = $request->validate([
            'supervisor_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'status' => ['nullable', 'in:submitted,approved,rejected,recorded'],
            'type' => ['nullable', 'in:excuse,absence,note,file'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        $actor = $request->user();
        abort_unless($this->staff($actor) || $actor->hasRole('CLINICAL_SUPERVISOR'), 403);
        $query = SupervisorFollowupRecord::query()->with(['supervisor:id,name', 'author:id,name', 'reviewer:id,name', 'site:id,name_ar,name_en', 'files']);
        if (!empty($data['supervisor_user_id'])) {
            $this->access->authorize($actor, (int) $data['supervisor_user_id']);
            $query->where('supervisor_user_id', $data['supervisor_user_id']);
        }
        $query->where(function ($q) use ($actor) {
            $q->where(fn ($own) => $own->where('supervisor_user_id', $actor->id)->where('visible_to_supervisor', true));
            if ($this->staff($actor)) $q->orWhere(function ($staff) use ($actor) {
                $staff->whereIn('supervisor_user_id', $this->access->users()->select('users.id'))->where('supervisor_user_id', '!=', $actor->id);
                if (!$this->access->can($actor, 'supervisor_records.view')) {
                    $staff->where(function ($limited) use ($actor) {
                        $limited->whereRaw('1 = 0');
                        if ($this->access->can($actor, 'supervisor_records.review')) $limited->orWhere('type', 'excuse');
                        if ($this->access->can($actor, 'supervisor_records.create')) $limited->orWhere('created_by', $actor->id);
                    });
                }
            });
        });
        if (!empty($data['status'])) $query->where('status', $data['status']);
        if (!empty($data['type'])) $query->where('type', $data['type']);
        $page = $query->latest('id')->paginate(20);
        $page->getCollection()->transform(fn ($record) => $this->present($record, $actor));
        return ApiResponse::success(['items' => $page->items(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()]);
    }

    public function store(Request $request, SecureFileUploadService $files)
    {
        $data = $request->validate([
            'supervisor_user_id' => ['required', 'integer', 'exists:users,id'],
            'type' => ['required', 'in:excuse,absence,note,file'],
            'title' => ['required', 'string', 'max:255'], 'body' => ['required', 'string', 'max:10000'],
            'record_date' => ['required', 'date'], 'end_date' => ['nullable', 'date', 'after_or_equal:record_date'],
            'training_site_id' => ['nullable', 'integer', 'exists:training_sites,id'],
            'visible_to_supervisor' => ['sometimes', 'boolean'],
            'files' => ['nullable', 'array', 'max:5', 'required_if:type,file'],
            'files.*' => ['file', 'max:10240'],
        ]);
        $actor = $request->user();
        $target = User::with('person.trainingSites')->whereHas('roles', fn ($q) => $q->where('code', 'CLINICAL_SUPERVISOR'))->findOrFail($data['supervisor_user_id']);
        $self = $actor->id === $target->id;
        $this->access->authorize($actor, $target->id);
        abort_unless($self ? $data['type'] === 'excuse' : $this->access->can($actor, 'supervisor_records.create'), 403);
        if (!empty($data['training_site_id']) && ! $target->person?->trainingSites->contains('id', $data['training_site_id'])
            && (int) $target->person?->primary_site_id !== (int) $data['training_site_id']) {
            throw ValidationException::withMessages(['training_site_id' => [__('supervisor_followup.invalid_site')]]);
        }
        $paths = [];
        try {
            $record = DB::transaction(function () use ($data, $actor, $target, $request, $files, &$paths) {
                $record = SupervisorFollowupRecord::create(collect($data)->except('files')->all() + ['created_by' => $actor->id, 'status' => $data['type'] === 'excuse' ? 'submitted' : 'recorded']);
                $record->update(['visible_to_supervisor' => $data['type'] === 'excuse' || (bool) ($data['visible_to_supervisor'] ?? false)]);
                foreach ($request->file('files', []) as $file) {
                    $stored = $files->storeDocument($file, 'supervisor-followup/'.$target->id.'/'.$record->id);
                    $paths[] = $stored['storage_path'];
                    $record->files()->create([
                        'original_name' => $file->getClientOriginalName(), 'storage_path' => $stored['storage_path'],
                        'mime_type' => $stored['mime_type'], 'size_bytes' => $stored['size_bytes'],
                    ]);
                }
                $this->audit($actor, $record, 'created', ['type' => $record->type, 'status' => $record->status, 'on_behalf' => $actor->id !== $target->id]);
                if ($record->type === 'excuse') {
                    $reviewers = User::where('is_active', true)->where('id', '!=', $actor->id)->where('id', '!=', $target->id)
                        ->where(fn ($q) => $q->whereHas('roles.permissions', fn ($p) => $p->where('code', 'supervisor_records.review'))
                            ->orWhereHas('directPermissions', fn ($p) => $p->where('code', 'supervisor_records.review')))->get();
                    foreach ($reviewers as $reviewer) {
                        if ($this->access->can($reviewer, 'supervisor_records.review') && $this->access->users($reviewer)->whereKey($target->id)->exists()) {
                            $reviewer->notify(new \App\Notifications\SupervisorExcuseNotification($record));
                        }
                    }
                }
                return $record;
            });
        } catch (\Throwable $error) {
            foreach ($paths as $path) Storage::disk('local')->delete($path);
            throw $error;
        }
        return ApiResponse::success($this->present($record, $actor), __('supervisor_followup.saved'), [], 201);
    }

    public function review(Request $request, SupervisorFollowupRecord $record)
    {
        $actor = $request->user();
        $this->authorizeRecord($actor, $record);
        abort_unless($this->access->can($actor, 'supervisor_records.review'), 403);
        $data = $request->validate(['decision' => ['required', 'in:approved,rejected'], 'review_note' => ['required', 'string', 'max:5000']]);
        DB::transaction(function () use ($record, $actor, $data) {
            $locked = SupervisorFollowupRecord::whereKey($record->id)->lockForUpdate()->firstOrFail();
            if ($locked->type !== 'excuse' || $locked->status !== 'submitted') throw ValidationException::withMessages(['decision' => [__('supervisor_followup.already_reviewed')]]);
            if ($locked->created_by === $actor->id || $locked->supervisor_user_id === $actor->id) throw ValidationException::withMessages(['decision' => [__('supervisor_followup.self_review')]]);
            $locked->update(['status' => $data['decision'], 'review_note' => $data['review_note'], 'reviewed_by' => $actor->id, 'reviewed_at' => now()]);
            $this->audit($actor, $locked, 'reviewed', ['from' => 'submitted', 'to' => $data['decision'], 'reason' => $data['review_note']]);
            $locked->supervisor->notify(new \App\Notifications\SupervisorExcuseNotification($locked, true));
            if ($locked->created_by !== $locked->supervisor_user_id && $locked->created_by !== $actor->id) {
                $locked->author->notify(new \App\Notifications\SupervisorExcuseNotification($locked, true));
            }
        });
        return ApiResponse::success($this->present($record->fresh(), $actor), __('supervisor_followup.reviewed'));
    }

    public function destroy(Request $request, SupervisorFollowupRecord $record)
    {
        $actor = $request->user();
        $this->authorizeRecord($actor, $record);
        abort_unless($this->access->can($actor, 'supervisor_records.delete') && $actor->id !== $record->supervisor_user_id, 403);
        $data = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:2000']]);
        DB::transaction(function () use ($actor, $record, $data) {
            $locked = SupervisorFollowupRecord::whereKey($record->id)->lockForUpdate()->firstOrFail();
            $this->audit($actor, $locked, 'deleted', ['reason' => $data['reason'], 'status' => $locked->status]);
            $locked->delete();
        });
        return ApiResponse::success(null, __('supervisor_followup.deleted'));
    }

    public function download(Request $request, SupervisorFollowupRecord $record, SupervisorFollowupFile $file)
    {
        $this->authorizeRecord($request->user(), $record);
        abort_unless((int) $file->record_id === (int) $record->id && Storage::disk('local')->exists($file->storage_path), 404);
        return Storage::disk('local')->download($file->storage_path, $file->original_name, ['Content-Type' => $file->mime_type, 'X-Content-Type-Options' => 'nosniff']);
    }

    private function authorizeRecord(User $actor, SupervisorFollowupRecord $record): void
    {
        $this->access->authorize($actor, $record->supervisor_user_id);
        $staffRead = $this->access->can($actor, 'supervisor_records.view')
            || ($record->type === 'excuse' && $this->access->can($actor, 'supervisor_records.review'))
            || ($record->created_by === $actor->id && $this->access->can($actor, 'supervisor_records.create'));
        abort_unless($actor->id === $record->supervisor_user_id ? $record->visible_to_supervisor : $staffRead, 403);
    }

    private function present(SupervisorFollowupRecord $record, User $actor): array
    {
        $record->loadMissing(['author:id,name', 'supervisor:id,name', 'reviewer:id,name', 'site:id,name_ar,name_en', 'files']);
        return [...$record->toArray(), 'files' => $record->files->map(fn ($file) => [
            'id' => $file->id, 'name' => $file->original_name, 'size_bytes' => $file->size_bytes,
            'download_url' => '/api/v1/supervisor-followup/'.$record->id.'/files/'.$file->id,
        ]), 'can_review' => $record->type === 'excuse' && $record->status === 'submitted' && $actor->id !== $record->created_by && $actor->id !== $record->supervisor_user_id && $this->access->can($actor, 'supervisor_records.review'),
            'can_delete' => $actor->id !== $record->supervisor_user_id && $this->access->can($actor, 'supervisor_records.delete')];
    }

    private function audit(User $actor, SupervisorFollowupRecord $record, string $action, array $changes): void
    {
        AuditLog::create(['user_id' => $actor->id, 'action' => 'supervisor_followup.'.$action, 'entity_type' => SupervisorFollowupRecord::class, 'entity_id' => $record->id, 'changes' => $changes, 'is_override' => false]);
    }
}

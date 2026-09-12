<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AuditLog;
use App\Models\OperationalTask;
use App\Notifications\AdministrativeWorkAssignedNotification;
use App\Notifications\LocalSystemNotification;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class OperationalTaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $request->validate([
            'view' => ['nullable', Rule::in(['mine', 'assigned', 'created', 'overdue', 'completed'])],
            'scope' => ['nullable', Rule::in(['mine', 'all', 'assigned', 'created'])],
            'status' => ['nullable', Rule::in(['open', 'in_progress', 'completed', 'cancelled'])],
            'priority' => ['nullable', Rule::in(['low', 'normal', 'high'])],
            'due' => ['nullable', Rule::in(['overdue', 'today', 'week', 'none'])],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);
        $accessible = OperationalTask::query()->where(fn ($q) => $q->where('assigned_to', $user->id)->orWhere('created_by', $user->id));
        $summary = [
            'mine' => (clone $accessible)->count(),
            'assigned' => (clone $accessible)->where('assigned_to', $user->id)->count(),
            'created' => (clone $accessible)->where('created_by', $user->id)->count(),
            'overdue' => (clone $accessible)->whereDate('due_date', '<', now()->toDateString())->whereNotIn('status', ['completed', 'cancelled'])->count(),
            'completed' => (clone $accessible)->where('status', 'completed')->count(),
        ];
        $query = (clone $accessible)->with(['creator.person', 'assignee.person', 'meetingActionItem.meeting'])->withCount('comments');
        // A management permission permits creating and assigning tasks; it does
        // not turn the task directory into a department-wide public list.
        if ($request->query('scope') === 'assigned') {
            $query->where('assigned_to', $user->id);
        }
        if ($request->query('scope') === 'created') {
            $query->where('created_by', $user->id);
        }
        match ($request->query('view', 'mine')) {
            'assigned' => $query->where('assigned_to', $user->id),
            'created' => $query->where('created_by', $user->id),
            'overdue' => $query->whereDate('due_date', '<', now()->toDateString())->whereNotIn('status', ['completed', 'cancelled']),
            'completed' => $query->where('status', 'completed'),
            default => null,
        };
        $query
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = trim($request->string('search')->toString());
                $q->where(fn ($x) => $x->where('title', 'like', "%{$search}%")->orWhere('description', 'like', "%{$search}%"));
            })
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('priority'), fn ($q) => $q->where('priority', $request->string('priority')))
            ->when($request->filled('assignee_id'), fn ($q) => $q->where('assigned_to', $request->integer('assignee_id')))
            ->when($request->query('due') === 'overdue', fn ($q) => $q->whereDate('due_date', '<', now()->toDateString())->whereNotIn('status', ['completed', 'cancelled']))
            ->when($request->query('due') === 'today', fn ($q) => $q->whereDate('due_date', now()->toDateString()))
            ->when($request->query('due') === 'week', fn ($q) => $q->whereBetween('due_date', [now()->startOfDay(), now()->addDays(7)->endOfDay()]))
            ->when($request->query('due') === 'none', fn ($q) => $q->whereNull('due_date'))
            ->when($request->boolean('overdue'), fn ($q) => $q->whereDate('due_date', '<', now()->toDateString())->whereNotIn('status', ['completed', 'cancelled']));

        $items = $query->orderByRaw("CASE WHEN status = 'completed' THEN 1 ELSE 0 END")
            ->orderByRaw('CASE WHEN due_date IS NULL THEN 1 ELSE 0 END')->orderBy('due_date')
            ->paginate(min($request->integer('per_page', 25), 100));
        $items->getCollection()->each(function (OperationalTask $task) use ($user) {
            $task->setAttribute('can_execute', $task->assigned_to === $user->id);
            $task->setAttribute('can_manage', $task->created_by === $user->id && Gate::forUser($user)->allows('permission', ['tasks.manage']));
            $task->setAttribute(
                'can_delete',
                $task->created_by === $user->id
                    && Gate::forUser($user)->allows('permission', ['tasks.manage'])
                    && $task->meetingActionItem === null
            );
        });

        return ApiResponse::success($items->items(), null, [
            'current_page' => $items->currentPage(), 'last_page' => $items->lastPage(), 'total' => $items->total(),
            'summary' => $summary,
        ]);
    }

    public function show(Request $request, OperationalTask $operationalTask): JsonResponse
    {
        $this->authorizeParticipant($request, $operationalTask);

        return ApiResponse::success($this->detail($operationalTask, $request));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $task = OperationalTask::create($data + ['created_by' => $request->user()->id]);
        $this->audit($request, $task, 'task.created', ['assigned_to' => $task->assigned_to]);
        $this->notify($task);

        return ApiResponse::success($task->load(['creator.person', 'assignee.person']), 'Task created.', [], 201);
    }

    public function update(Request $request, OperationalTask $operationalTask): JsonResponse
    {
        $userId = $request->user()->id;
        $isCreator = $operationalTask->created_by === $userId;
        $isAssignee = $operationalTask->assigned_to === $userId;
        if (! $isCreator && ! $isAssignee) {
            throw new AuthorizationException('This action is unauthorized.');
        }
        $data = $request->validate($this->rules(true));

        $managementFields = array_intersect(array_keys($data), ['title', 'description', 'assigned_to', 'due_date', 'priority']);
        $canManage = $isCreator && Gate::forUser($request->user())->allows('permission', ['tasks.manage']);
        if ($managementFields && ! $canManage) {
            throw new AuthorizationException('Only the task creator may edit or reassign it.');
        }
        if (isset($data['status'])) {
            $executionStatuses = ['in_progress', 'completed'];
            if (in_array($data['status'], $executionStatuses, true) && ! $isAssignee) {
                throw new AuthorizationException('Only the assigned user may start or complete this task.');
            }
            if (in_array($data['status'], ['open', 'cancelled'], true) && ! $canManage) {
                throw new AuthorizationException('Only the task creator may cancel this task.');
            }
        }
        if (array_key_exists('completion_notes', $data) && ! $isAssignee) {
            throw new AuthorizationException('Only the assigned user may document task completion.');
        }
        $oldAssignee = $operationalTask->assigned_to;
        $oldStatus = $operationalTask->status;
        $oldValues = $operationalTask->only(['title', 'description', 'assigned_to', 'due_date', 'priority', 'status']);
        if (($data['status'] ?? null) === 'in_progress' && ! $operationalTask->started_at) {
            $data['started_at'] = now();
        }
        if (($data['status'] ?? null) === 'completed') {
            $data['completed_at'] = now();
        }
        if (isset($data['status']) && $data['status'] !== 'completed') {
            $data['completed_at'] = null;
        }
        $operationalTask->update($data);
        $changes = collect($operationalTask->only(array_keys($oldValues)))
            ->filter(fn ($value, $key) => (string) $value !== (string) ($oldValues[$key] ?? null))->all();
        $this->audit($request, $operationalTask, 'task.updated', $changes);
        if ($operationalTask->meetingActionItem) {
            $operationalTask->meetingActionItem->update([
                'status' => $operationalTask->status,
                'completed_date' => $operationalTask->status === 'completed' ? now()->toDateString() : null,
                'completion_evidence' => $operationalTask->completion_notes,
            ]);
        }
        if ($oldAssignee !== $operationalTask->assigned_to) {
            $this->notify($operationalTask);
        } elseif (array_intersect(array_keys($changes), ['title', 'description', 'due_date', 'priority'])) {
            $this->notifyUpdated($operationalTask, $request->user()->name);
        }
        if ($oldStatus !== $operationalTask->status) {
            $this->notifyStatusChanged($operationalTask, $request->user()->name);
        }

        return ApiResponse::success($this->summaryTask($operationalTask->fresh()->load(['creator.person', 'assignee.person', 'meetingActionItem.meeting']), $request));
    }

    public function storeComment(Request $request, OperationalTask $operationalTask): JsonResponse
    {
        $this->authorizeParticipant($request, $operationalTask);
        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);
        $comment = $operationalTask->comments()->create(['user_id' => $request->user()->id, 'body' => trim($data['body'])]);
        $this->audit($request, $operationalTask, 'task.comment_added', ['comment_id' => $comment->id]);

        $recipientId = $operationalTask->created_by === $request->user()->id ? $operationalTask->assigned_to : $operationalTask->created_by;
        $recipient = $recipientId ? \App\Models\User::find($recipientId) : null;
        if ($recipient && $recipient->id !== $request->user()->id) {
            $recipient->notify(new LocalSystemNotification([
                'event_key' => 'task.comment', 'category' => 'tasks', 'severity' => 'info',
                'title_ar' => 'تعليق جديد على مهمة', 'title_en' => 'New task comment',
                'message_ar' => 'أضيف تعليق جديد على: '.$operationalTask->title,
                'message_en' => 'A new comment was added to: '.$operationalTask->title,
                'action_url' => '/tasks?task='.$operationalTask->id,
                'entity_type' => 'task', 'entity_id' => $operationalTask->id,
                'actor_name' => $request->user()->name,
            ]));
        }

        return ApiResponse::success($comment->load('user.person'), $this->tr('تمت إضافة التعليق.', 'Comment added.'), [], 201);
    }

    public function destroy(Request $request, OperationalTask $operationalTask): JsonResponse
    {
        if ($operationalTask->created_by !== $request->user()->id) {
            throw new AuthorizationException('Only the task creator may delete it.');
        }
        if ($operationalTask->meetingActionItem()->exists()) {
            throw ValidationException::withMessages(['task' => ['A meeting task must be deleted from its meeting minutes.']]);
        }
        $this->audit($request, $operationalTask, 'task.deleted');
        $operationalTask->delete();

        return ApiResponse::success(null, 'Task deleted.');
    }

    private function rules(bool $partial = false): array
    {
        $sometimes = $partial ? ['sometimes'] : [];

        return [
            'title' => [...$sometimes, 'required', 'string', 'max:255'], 'description' => ['nullable', 'string', 'max:5000'],
            'assigned_to' => $partial ? ['sometimes', 'required', 'exists:users,id'] : ['required', 'exists:users,id'], 'due_date' => ['nullable', 'date'],
            'priority' => [...$sometimes, 'required', Rule::in(['low', 'normal', 'high'])],
            'status' => ['sometimes', Rule::in(['open', 'in_progress', 'completed', 'cancelled'])],
            'completion_notes' => ['nullable', 'string', 'max:5000'],
        ];
    }

    private function notify(OperationalTask $task): void
    {
        $task->loadMissing('assignee');
        $task->assignee?->notify(new AdministrativeWorkAssignedNotification('task', $task->id, $task->title));
    }

    private function notifyStatusChanged(OperationalTask $task, string $actorName): void
    {
        $recipient = $task->status === 'cancelled' ? $task->assignee : $task->creator;
        if (! $recipient || (int) $recipient->id === (int) auth()->id()) {
            return;
        }

        $labels = [
            'open' => ['ar' => 'أعيد فتح المهمة', 'en' => 'Task reopened'],
            'in_progress' => ['ar' => 'بدأ تنفيذ المهمة', 'en' => 'Task started'],
            'completed' => ['ar' => 'تم إنجاز المهمة', 'en' => 'Task completed'],
            'cancelled' => ['ar' => 'تم إلغاء المهمة', 'en' => 'Task cancelled'],
        ];
        $label = $labels[$task->status] ?? $labels['open'];

        $recipient->notify(new LocalSystemNotification([
            'event_key' => 'task.status_changed',
            'category' => 'tasks',
            'severity' => in_array($task->status, ['completed', 'cancelled'], true) ? 'action' : 'info',
            'title_ar' => $label['ar'],
            'title_en' => $label['en'],
            'message_ar' => $label['ar'].': '.$task->title,
            'message_en' => $label['en'].': '.$task->title,
            'action_url' => '/tasks?task='.$task->id,
            'entity_type' => 'task',
            'entity_id' => $task->id,
            'actor_name' => $actorName,
        ]));
    }

    private function notifyUpdated(OperationalTask $task, string $actorName): void
    {
        $task->loadMissing('assignee');
        if (! $task->assignee || (int) $task->assignee->id === (int) auth()->id()) {
            return;
        }
        $task->assignee->notify(new LocalSystemNotification([
            'event_key' => 'task.updated', 'category' => 'tasks', 'severity' => 'action',
            'title_ar' => 'تم تحديث مهمة مكلّف بها', 'title_en' => 'Assigned task updated',
            'message_ar' => 'تم تحديث تفاصيل أو موعد المهمة: '.$task->title,
            'message_en' => 'Task details or due date were updated: '.$task->title,
            'action_url' => '/tasks?task='.$task->id,
            'entity_type' => 'task', 'entity_id' => $task->id, 'actor_name' => $actorName,
        ]));
    }

    private function authorizeParticipant(Request $request, OperationalTask $task): void
    {
        if (! in_array($request->user()->id, [$task->created_by, $task->assigned_to], true)) {
            throw new AuthorizationException('This action is unauthorized.');
        }
    }

    private function summaryTask(OperationalTask $task, Request $request): OperationalTask
    {
        $task->setAttribute('can_execute', $task->assigned_to === $request->user()->id);
        $task->setAttribute('can_manage', $task->created_by === $request->user()->id && Gate::forUser($request->user())->allows('permission', ['tasks.manage']));
        $task->setAttribute('can_delete', $task->getAttribute('can_manage') && $task->meetingActionItem === null);

        return $task;
    }

    private function detail(OperationalTask $task, Request $request): OperationalTask
    {
        $task = $task->fresh()->load(['creator.person', 'assignee.person', 'meetingActionItem.meeting', 'comments.user.person']);
        $task->setAttribute('activity', AuditLog::with('user.person')->where('entity_type', OperationalTask::class)->where('entity_id', $task->id)->oldest()->get());

        return $this->summaryTask($task, $request);
    }

    private function audit(Request $request, OperationalTask $task, string $action, array $changes = []): void
    {
        AuditLog::create(['user_id' => $request->user()->id, 'action' => $action, 'entity_type' => OperationalTask::class, 'entity_id' => $task->id, 'changes' => $changes]);
    }

    private function tr(string $ar, string $en): string
    {
        return app()->getLocale() === 'ar' ? $ar : $en;
    }
}

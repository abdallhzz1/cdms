<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\OperationalTask;
use App\Notifications\AdministrativeWorkAssignedNotification;
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
        $query = OperationalTask::query()->with(['creator.person', 'assignee.person', 'meetingActionItem.meeting']);
        // A management permission permits creating and assigning tasks; it does
        // not turn the task directory into a department-wide public list.
        $query->where(fn ($q) => $q->where('assigned_to', $user->id)->orWhere('created_by', $user->id));
        if ($request->query('scope') === 'assigned') $query->where('assigned_to', $user->id);
        if ($request->query('scope') === 'created') $query->where('created_by', $user->id);
        $query
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = trim($request->string('search')->toString());
                $q->where(fn ($x) => $x->where('title', 'like', "%{$search}%")->orWhere('description', 'like', "%{$search}%"));
            })
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('priority'), fn ($q) => $q->where('priority', $request->string('priority')))
            ->when($request->boolean('overdue'), fn ($q) => $q->whereDate('due_date', '<', now()->toDateString())->whereNotIn('status', ['completed', 'cancelled']));

        $items = $query->orderByRaw("CASE WHEN status = 'completed' THEN 1 ELSE 0 END")
            ->orderByRaw('CASE WHEN due_date IS NULL THEN 1 ELSE 0 END')->orderBy('due_date')
            ->paginate(min($request->integer('per_page', 25), 100));
        $items->getCollection()->each(function (OperationalTask $task) use ($user) {
            $task->setAttribute('can_execute', $task->assigned_to === $user->id);
            $task->setAttribute('can_manage', $task->created_by === $user->id);
            $task->setAttribute(
                'can_delete',
                $task->created_by === $user->id
                    && Gate::forUser($user)->allows('permission', ['tasks.manage'])
                    && $task->meetingActionItem === null
            );
        });
        return ApiResponse::success($items->items(), null, [
            'current_page' => $items->currentPage(), 'last_page' => $items->lastPage(), 'total' => $items->total(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $task = OperationalTask::create($data + ['created_by' => $request->user()->id]);
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
        if ($managementFields && ! $isCreator) {
            throw new AuthorizationException('Only the task creator may edit or reassign it.');
        }
        if (isset($data['status'])) {
            $executionStatuses = ['in_progress', 'completed'];
            if (in_array($data['status'], $executionStatuses, true) && ! $isAssignee) {
                throw new AuthorizationException('Only the assigned user may start or complete this task.');
            }
            if ($data['status'] === 'cancelled' && ! $isCreator) {
                throw new AuthorizationException('Only the task creator may cancel this task.');
            }
        }
        if (array_key_exists('completion_notes', $data) && ! $isAssignee) {
            throw new AuthorizationException('Only the assigned user may document task completion.');
        }
        $oldAssignee = $operationalTask->assigned_to;
        if (($data['status'] ?? null) === 'in_progress' && ! $operationalTask->started_at) $data['started_at'] = now();
        if (($data['status'] ?? null) === 'completed') $data['completed_at'] = now();
        if (isset($data['status']) && $data['status'] !== 'completed') $data['completed_at'] = null;
        $operationalTask->update($data);
        if ($operationalTask->meetingActionItem) {
            $operationalTask->meetingActionItem->update([
                'status' => $operationalTask->status,
                'completed_date' => $operationalTask->status === 'completed' ? now()->toDateString() : null,
                'completion_evidence' => $operationalTask->completion_notes,
            ]);
        }
        if ($oldAssignee !== $operationalTask->assigned_to) $this->notify($operationalTask);
        return ApiResponse::success($operationalTask->fresh()->load(['creator.person', 'assignee.person', 'meetingActionItem.meeting']));
    }

    public function destroy(Request $request, OperationalTask $operationalTask): JsonResponse
    {
        if ($operationalTask->created_by !== $request->user()->id) {
            throw new AuthorizationException('Only the task creator may delete it.');
        }
        if ($operationalTask->meetingActionItem()->exists()) {
            throw ValidationException::withMessages(['task' => ['A meeting task must be deleted from its meeting minutes.']]);
        }
        $operationalTask->delete();
        return ApiResponse::success(null, 'Task deleted.');
    }

    private function rules(bool $partial = false): array
    {
        $sometimes = $partial ? ['sometimes'] : [];
        return [
            'title' => [...$sometimes, 'required', 'string', 'max:255'], 'description' => ['nullable', 'string', 'max:5000'],
            'assigned_to' => ['nullable', 'exists:users,id'], 'due_date' => ['nullable', 'date'],
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
}

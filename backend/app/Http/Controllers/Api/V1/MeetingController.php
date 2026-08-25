<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Meeting;
use App\Models\MeetingActionItem;
use App\Models\OperationalTask;
use App\Models\WorkflowTransitionLog;
use App\Notifications\AdministrativeWorkAssignedNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class MeetingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Meeting::query()->with(['creator.person', 'approver.person'])
            ->withCount(['actionItems', 'actionItems as open_actions_count' => fn ($q) => $q->whereNotIn('status', ['completed', 'cancelled'])])
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = trim($request->string('search')->toString());
                $q->where(fn ($x) => $x->where('minutes_number', 'like', "%{$search}%")
                    ->orWhere('meeting_type', 'like', "%{$search}%")
                    ->orWhere('agenda', 'like', "%{$search}%"));
            })
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')));

        $items = $query->orderByDesc('meeting_date')->orderByDesc('id')->paginate(min($request->integer('per_page', 25), 100));
        return ApiResponse::success($items->items(), null, [
            'current_page' => $items->currentPage(), 'last_page' => $items->lastPage(), 'total' => $items->total(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $data['created_by'] = $request->user()->id;
        $data['status'] = $data['status'] ?? 'draft';
        return ApiResponse::success(Meeting::create($data), 'Meeting created.', [], 201);
    }

    public function show(Meeting $meeting): JsonResponse
    {
        return ApiResponse::success($meeting->load([
            'creator.person', 'approver.person', 'actionItems.assignee.person', 'actionItems.operationalTask', 'transitions.user.person',
        ]));
    }

    public function update(Request $request, Meeting $meeting): JsonResponse
    {
        if ($meeting->status === 'approved') {
            throw ValidationException::withMessages(['status' => ['Approved minutes must be reopened before editing.']]);
        }
        $meeting->update($request->validate($this->rules($meeting, true)));
        return ApiResponse::success($meeting->fresh(), 'Meeting updated.');
    }

    public function changeStatus(Request $request, Meeting $meeting): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['draft', 'scheduled', 'held', 'minutes_draft', 'cancelled'])],
            'reason' => ['nullable', 'string', 'max:3000'],
        ]);
        $allowed = [
            'draft' => ['scheduled', 'cancelled'], 'scheduled' => ['held', 'cancelled', 'draft'],
            'held' => ['minutes_draft', 'scheduled'], 'minutes_draft' => ['held'], 'cancelled' => ['draft'],
        ];
        if (! in_array($data['status'], $allowed[$meeting->status] ?? [], true)) {
            throw ValidationException::withMessages(['status' => ['Invalid meeting status transition.']]);
        }
        $from = $meeting->status;
        $meeting->update([
            'status' => $data['status'],
            'cancelled_at' => $data['status'] === 'cancelled' ? now() : null,
            'cancellation_reason' => $data['status'] === 'cancelled' ? ($data['reason'] ?? null) : null,
        ]);
        $this->recordStatus($meeting, $from, $data['status'], $request->user()->id, $data['reason'] ?? null);
        return ApiResponse::success($meeting->fresh(), 'Meeting status updated.');
    }

    public function approve(Request $request, Meeting $meeting): JsonResponse
    {
        if (! in_array($meeting->status, ['held', 'minutes_draft'], true)) {
            throw ValidationException::withMessages(['status' => ['Only held meetings with completed minutes may be approved.']]);
        }
        $from = $meeting->status;
        $meeting->update(['status' => 'approved', 'approved_by' => $request->user()->id, 'approved_at' => now()]);
        $this->recordStatus($meeting, $from, 'approved', $request->user()->id);
        return ApiResponse::success($meeting->fresh()->load('approver.person'), 'Meeting minutes approved.');
    }

    public function reopen(Request $request, Meeting $meeting): JsonResponse
    {
        if ($meeting->status !== 'approved') {
            throw ValidationException::withMessages(['status' => ['Only approved minutes may be reopened.']]);
        }
        $meeting->update(['status' => 'minutes_draft', 'approved_by' => null, 'approved_at' => null]);
        $this->recordStatus($meeting, 'approved', 'minutes_draft', $request->user()->id, 'Minutes reopened for editing');
        return ApiResponse::success($meeting->fresh(), 'Meeting minutes reopened for editing.');
    }

    public function storeAction(Request $request, Meeting $meeting): JsonResponse
    {
        if ($meeting->status === 'approved') {
            throw ValidationException::withMessages(['status' => ['Approved minutes must be reopened before adding action items.']]);
        }
        $data = $request->validate($this->actionRules());

        $item = DB::transaction(function () use ($data, $meeting, $request) {
            $item = $meeting->actionItems()->create($data);
            if ($item->item_type === 'task') {
                $task = OperationalTask::create([
                    'created_by' => $request->user()->id, 'assigned_to' => $item->assigned_to,
                    'source_type' => Meeting::class, 'source_id' => $meeting->id,
                    'title' => $item->description, 'description' => $item->notes,
                    'priority' => $item->priority, 'due_date' => $item->due_date, 'status' => 'open',
                ]);
                $item->update(['operational_task_id' => $task->id]);
            }
            return $item;
        });
        $this->notifyTaskAssignee($item);
        return ApiResponse::success($item->load(['assignee.person', 'operationalTask']), 'Meeting action created.', [], 201);
    }

    public function updateAction(Request $request, Meeting $meeting, MeetingActionItem $action): JsonResponse
    {
        $this->ensureActionBelongsToMeeting($meeting, $action);
        if ($meeting->status === 'approved') {
            throw ValidationException::withMessages(['status' => ['Approved minutes must be reopened before editing action items.']]);
        }
        $data = $request->validate($this->actionRules(true));
        DB::transaction(function () use ($action, $data) {
            $action->update($data);
            if ($action->operationalTask) {
                $action->operationalTask->update([
                    'assigned_to' => $action->assigned_to, 'title' => $action->description,
                    'description' => $action->notes, 'priority' => $action->priority,
                    'due_date' => $action->due_date, 'status' => $action->status === 'completed' ? 'completed' : $action->operationalTask->status,
                    'completed_at' => $action->status === 'completed' ? now() : null,
                ]);
            }
        });
        $this->notifyTaskAssignee($action);
        return ApiResponse::success($action->fresh()->load(['assignee.person', 'operationalTask']), 'Meeting action updated.');
    }

    public function destroyAction(Meeting $meeting, MeetingActionItem $action): JsonResponse
    {
        $this->ensureActionBelongsToMeeting($meeting, $action);
        if ($meeting->status === 'approved') {
            throw ValidationException::withMessages(['status' => ['Approved minutes must be reopened before deleting action items.']]);
        }
        DB::transaction(function () use ($action) {
            $task = $action->operationalTask;
            $action->delete();
            $task?->delete();
        });
        return ApiResponse::success(null, 'Meeting action deleted.');
    }

    private function rules(?Meeting $meeting = null, bool $partial = false): array
    {
        $sometimes = $partial ? ['sometimes'] : [];
        return [
            'minutes_number' => [...$sometimes, 'required', 'string', 'max:100', Rule::unique('meetings', 'minutes_number')->ignore($meeting?->id)],
            'meeting_type' => [...$sometimes, 'required', 'string', 'max:255'],
            'status' => ['sometimes', Rule::in(['draft', 'scheduled'])],
            'meeting_date' => [...$sometimes, 'required', 'date'], 'meeting_time' => ['nullable', 'date_format:H:i'],
            'location' => ['nullable', 'string', 'max:255'], 'chairperson' => ['nullable', 'string', 'max:255'],
            'attendees' => ['nullable', 'string', 'max:10000'], 'absentees' => ['nullable', 'string', 'max:10000'],
            'agenda' => ['nullable', 'string', 'max:10000'], 'discussion_summary' => ['nullable', 'string', 'max:10000'],
            'decisions_summary' => ['nullable', 'string', 'max:10000'], 'implementation_owner' => ['nullable', 'string', 'max:255'],
        ];
    }

    private function actionRules(bool $partial = false): array
    {
        $sometimes = $partial ? ['sometimes'] : [];
        return [
            'item_type' => [...$sometimes, 'required', Rule::in(['decision', 'recommendation', 'task'])],
            'description' => [...$sometimes, 'required', 'string', 'max:5000'],
            'responsible' => ['nullable', 'string', 'max:255'], 'assigned_to' => ['nullable', 'exists:users,id'],
            'executing_entity' => ['nullable', 'string', 'max:255'], 'priority' => [...$sometimes, 'required', Rule::in(['low', 'normal', 'high'])],
            'due_date' => ['nullable', 'date'], 'status' => ['sometimes', Rule::in(['open', 'in_progress', 'completed', 'cancelled'])],
            'completion_evidence' => ['nullable', 'string', 'max:5000'], 'notes' => ['nullable', 'string', 'max:3000'],
        ];
    }

    private function ensureActionBelongsToMeeting(Meeting $meeting, MeetingActionItem $action): void
    {
        abort_unless($action->meeting_id === $meeting->id, 404);
    }

    private function notifyTaskAssignee(MeetingActionItem $item): void
    {
        if ($item->item_type === 'task' && $item->assigned_to) {
            $item->loadMissing('assignee');
            $item->assignee?->notify(new AdministrativeWorkAssignedNotification('task', $item->operational_task_id, $item->description));
        }
    }

    private function recordStatus(Meeting $meeting, string $from, string $to, int $userId, ?string $reason = null): void
    {
        WorkflowTransitionLog::create([
            'entity_type' => Meeting::class, 'entity_id' => $meeting->id, 'from_state' => $from,
            'to_state' => $to, 'user_id' => $userId, 'reason' => $reason,
        ]);
    }
}

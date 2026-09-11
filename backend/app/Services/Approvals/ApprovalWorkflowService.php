<?php

namespace App\Services\Approvals;

use App\Models\ApprovalAction;
use App\Models\ApprovalRequest;
use App\Models\ApprovalWorkflow;
use App\Models\ApprovalWorkflowStep;
use App\Models\User;
use App\Notifications\LocalSystemNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ApprovalWorkflowService
{
    public function submit(
        string $workflowCode,
        string $subjectType,
        string|int $subjectId,
        User $requester,
        string $titleAr,
        string $titleEn,
        ?string $sourceUrl = null,
        array $context = [],
    ): ApprovalRequest {
        $workflow = $this->workflow($workflowCode);
        [$request, $created] = DB::transaction(function () use ($workflow, $subjectType, $subjectId, $requester, $titleAr, $titleEn, $sourceUrl, $context) {
            // Serialise submissions for the same workflow so two simultaneous
            // clicks cannot create duplicate pending approval requests.
            ApprovalWorkflow::query()->whereKey($workflow->id)->lockForUpdate()->firstOrFail();
            $existing = ApprovalRequest::query()
                ->where('approval_workflow_id', $workflow->id)
                ->where('subject_type', $subjectType)->where('subject_id', (string) $subjectId)
                ->where('status', 'pending')->latest('id')->first();
            if ($existing) return [$existing, false];

            $request = ApprovalRequest::create([
                'public_id' => (string) Str::uuid(), 'approval_workflow_id' => $workflow->id,
                'subject_type' => $subjectType, 'subject_id' => (string) $subjectId,
                'title_ar' => $titleAr, 'title_en' => $titleEn, 'source_url' => $sourceUrl,
                'context' => $context, 'status' => 'pending', 'current_step_order' => 1,
                'requested_by' => $requester->id, 'requested_at' => now(),
            ]);
            ApprovalAction::create([
                'approval_request_id' => $request->id, 'actor_user_id' => $requester->id,
                'action' => 'submitted', 'acted_at' => now(),
            ]);
            return [$request, true];
        });
        if ($created) $this->notifyCurrentApprovers($request);
        return $request->load(['workflow.steps', 'requester']);
    }

    /** @return array{request:ApprovalRequest, completed:bool} */
    public function approve(string $workflowCode, string $subjectType, string|int $subjectId, User $actor, ?string $comment = null): array
    {
        return DB::transaction(function () use ($workflowCode, $subjectType, $subjectId, $actor, $comment) {
            $request = $this->pendingRequest($workflowCode, $subjectType, $subjectId, true);
            $workflow = $request->workflow;
            $step = $this->authorizeCurrentStep($request, $actor);

            if ($workflow->prevent_requester_approval && (int) $request->requested_by === (int) $actor->id) {
                throw ValidationException::withMessages(['approval' => [$this->tr('لا يجوز لمقدم الطلب اعتماد طلبه.', 'The requester cannot approve their own request.')]]);
            }
            if ($workflow->require_distinct_approvers && $request->actions()->where('action', 'approved')->where('actor_user_id', $actor->id)->exists()) {
                throw ValidationException::withMessages(['approval' => [$this->tr('يجب تنفيذ مراحل الاعتماد بواسطة أشخاص مختلفين.', 'Approval stages must be completed by different people.')]]);
            }

            ApprovalAction::create([
                'approval_request_id' => $request->id, 'approval_workflow_step_id' => $step->id,
                'actor_user_id' => $actor->id, 'action' => 'approved', 'comment' => $comment,
                'metadata' => ['step_order' => $step->step_order, 'name_ar' => $step->name_ar, 'name_en' => $step->name_en, 'role_codes' => $step->role_codes],
                'acted_at' => now(),
            ]);

            $lastOrder = (int) $workflow->steps->max('step_order');
            $completed = (int) $request->current_step_order >= $lastOrder;
            $request->update($completed
                ? ['status' => 'approved', 'completed_at' => now()]
                : ['current_step_order' => (int) $request->current_step_order + 1]);

            if ($completed) $this->notifyRequester($request, 'approved');
            else $this->notifyCurrentApprovers($request->fresh());

            return ['request' => $request->fresh()->load(['workflow.steps', 'requester', 'actions.actor', 'actions.step']), 'completed' => $completed];
        });
    }

    public function returnForRevision(string $workflowCode, string $subjectType, string|int $subjectId, User $actor, string $reason): ApprovalRequest
    {
        return DB::transaction(function () use ($workflowCode, $subjectType, $subjectId, $actor, $reason) {
            $request = $this->pendingRequest($workflowCode, $subjectType, $subjectId, true);
            $step = $this->authorizeCurrentStep($request, $actor);
            if ($request->workflow->prevent_requester_approval && (int) $request->requested_by === (int) $actor->id) {
                throw ValidationException::withMessages(['approval' => [$this->tr('لا يجوز لمقدم الطلب إعادة طلبه بنفسه.', 'The requester cannot return their own request.')]]);
            }
            ApprovalAction::create([
                'approval_request_id' => $request->id, 'approval_workflow_step_id' => $step->id,
                'actor_user_id' => $actor->id, 'action' => 'returned', 'comment' => $reason,
                'metadata' => ['step_order' => $step->step_order, 'name_ar' => $step->name_ar, 'name_en' => $step->name_en, 'role_codes' => $step->role_codes],
                'acted_at' => now(),
            ]);
            $request->update(['status' => 'returned', 'returned_at' => now()]);
            $this->notifyRequester($request, 'returned', $reason);
            return $request->fresh()->load(['workflow.steps', 'requester', 'actions.actor', 'actions.step']);
        });
    }

    public function pending(string $workflowCode, string $subjectType, string|int $subjectId): ?ApprovalRequest
    {
        $workflow = ApprovalWorkflow::where('code', $workflowCode)->first();
        if (! $workflow) return null;
        return ApprovalRequest::where('approval_workflow_id', $workflow->id)->where('subject_type', $subjectType)
            ->where('subject_id', (string) $subjectId)->where('status', 'pending')->latest('id')
            ->with(['workflow.steps', 'requester', 'actions.actor', 'actions.step'])->first();
    }

    public function canApproveCurrentStep(ApprovalRequest $request, User $actor): bool
    {
        $request->loadMissing(['workflow.steps', 'actions']);
        $step = $request->workflow->steps->firstWhere('step_order', (int) $request->current_step_order);
        if (! $step || $actor->roles()->pluck('code')->intersect($step->role_codes ?: [])->isEmpty()) {
            return false;
        }
        if ($request->workflow->prevent_requester_approval && (int) $request->requested_by === (int) $actor->id) {
            return false;
        }
        return ! ($request->workflow->require_distinct_approvers
            && $request->actions()->where('action', 'approved')->where('actor_user_id', $actor->id)->exists());
    }

    public function cancelPending(string $workflowCode, string $subjectType, string|int $subjectId, User $actor, string $reason): void
    {
        $workflow = ApprovalWorkflow::where('code', $workflowCode)->first();
        if (! $workflow) return;
        ApprovalRequest::query()->where('approval_workflow_id', $workflow->id)->where('subject_type', $subjectType)
            ->where('subject_id', (string) $subjectId)->where('status', 'pending')->get()->each(function (ApprovalRequest $request) use ($actor, $reason) {
                $request->update(['status' => 'cancelled']);
                ApprovalAction::create(['approval_request_id' => $request->id, 'actor_user_id' => $actor->id, 'action' => 'cancelled', 'comment' => $reason, 'acted_at' => now()]);
            });
    }

    public function withdrawOwnApproval(string $workflowCode, string $subjectType, string|int $subjectId, User $actor, string $reason): ApprovalRequest
    {
        $request = DB::transaction(function () use ($workflowCode, $subjectType, $subjectId, $actor, $reason) {
            $request = $this->pendingRequest($workflowCode, $subjectType, $subjectId, true);
            $approvedAction = $request->actions()
                ->where('actor_user_id', $actor->id)
                ->where('action', 'approved')
                ->with('step')->latest('acted_at')->first();

            if (! $approvedAction || ! $approvedAction->step
                || (int) $request->current_step_order <= (int) $approvedAction->step->step_order) {
                throw ValidationException::withMessages(['approval' => [$this->tr(
                    'لا يوجد اعتماد سابق لك يمكن سحبه في المرحلة الحالية.',
                    'You do not have a prior approval that can be withdrawn at the current stage.',
                )]]);
            }

            ApprovalAction::create([
                'approval_request_id' => $request->id,
                'approval_workflow_step_id' => $approvedAction->approval_workflow_step_id,
                'actor_user_id' => $actor->id,
                'action' => 'withdrawn',
                'comment' => $reason,
                'metadata' => ['withdrawn_step_order' => $approvedAction->step->step_order],
                'acted_at' => now(),
            ]);
            $request->update(['status' => 'cancelled', 'returned_at' => now()]);

            return $request->fresh()->load(['workflow.steps', 'requester']);
        });

        $request->requester?->notify(new LocalSystemNotification([
            'event_key' => 'approval.withdrawn', 'category' => 'approvals', 'severity' => 'urgent',
            'title_ar' => 'سُحب اعتماد كشف العلامات', 'title_en' => 'Grade sheet approval withdrawn',
            'message_ar' => $request->title_ar.' — '.$reason,
            'message_en' => $request->title_en.' — '.$reason,
            'action_url' => $request->source_url ?: '/grades', 'approval_request_id' => $request->public_id,
        ]));

        $currentStep = $request->workflow->steps->firstWhere('step_order', (int) $request->current_step_order);
        if ($currentStep) {
            User::query()->where('is_active', true)
                ->whereKeyNot($actor->id)
                ->whereHas('roles', fn ($query) => $query->whereIn('code', $currentStep->role_codes ?: []))
                ->each(fn (User $user) => $user->notify(new LocalSystemNotification([
                    'event_key' => 'approval.withdrawn', 'category' => 'approvals', 'severity' => 'notice',
                    'title_ar' => 'تم سحب طلب اعتماد', 'title_en' => 'Approval request withdrawn',
                    'message_ar' => $request->title_ar.' — '.$reason,
                    'message_en' => $request->title_en.' — '.$reason,
                    'action_url' => '/approvals', 'approval_request_id' => $request->public_id,
                ])));
        }

        return $request;
    }

    private function workflow(string $code): ApprovalWorkflow
    {
        $workflow = ApprovalWorkflow::with('steps')->where('code', $code)->where('is_active', true)->first();
        if (! $workflow || $workflow->steps->isEmpty()) {
            throw ValidationException::withMessages(['approval' => [$this->tr('مسار الاعتماد غير مفعّل أو لا يحتوي مراحل. راجع إعدادات الاعتمادات.', 'The approval workflow is inactive or has no steps. Check approval settings.')]]);
        }
        return $workflow;
    }

    private function pendingRequest(string $workflowCode, string $subjectType, string|int $subjectId, bool $lock): ApprovalRequest
    {
        $workflow = $this->workflow($workflowCode);
        $query = ApprovalRequest::where('approval_workflow_id', $workflow->id)->where('subject_type', $subjectType)
            ->where('subject_id', (string) $subjectId)->where('status', 'pending')->latest('id');
        if ($lock) $query->lockForUpdate();
        $request = $query->first();
        if (! $request) throw ValidationException::withMessages(['approval' => [$this->tr('لا يوجد طلب اعتماد نشط لهذه العملية.', 'No active approval request exists for this record.')]]);
        return $request->load(['workflow.steps', 'actions']);
    }

    private function authorizeCurrentStep(ApprovalRequest $request, User $actor): ApprovalWorkflowStep
    {
        $step = $request->workflow->steps->firstWhere('step_order', (int) $request->current_step_order);
        if (! $step) throw ValidationException::withMessages(['approval' => [$this->tr('مرحلة الاعتماد الحالية غير معرفة.', 'The current approval step is not configured.')]]);
        $actorRoles = $actor->roles()->pluck('code');
        if ($actorRoles->intersect($step->role_codes ?: [])->isEmpty()) {
            throw ValidationException::withMessages(['approval' => [$this->tr('هذا الطلب بانتظار جهة اعتماد أخرى.', 'This request is awaiting another approval role.')]]);
        }
        return $step;
    }

    private function notifyCurrentApprovers(ApprovalRequest $request): void
    {
        $request->loadMissing(['workflow.steps', 'requester']);
        $step = $request->workflow->steps->firstWhere('step_order', (int) $request->current_step_order);
        if (! $step) return;
        User::query()->where('is_active', true)->whereHas('roles', fn ($q) => $q->whereIn('code', $step->role_codes ?: []))
            ->when($request->workflow->prevent_requester_approval, fn ($query) => $query->whereKeyNot($request->requested_by))
            ->each(function (User $user) use ($request, $step) {
                $user->notify(new LocalSystemNotification([
                    'event_key' => 'approval.awaiting', 'category' => 'approvals', 'severity' => 'notice',
                    'title_ar' => 'طلب اعتماد جديد', 'title_en' => 'New approval request',
                    'message_ar' => $request->title_ar.' — '.$step->name_ar,
                    'message_en' => $request->title_en.' — '.$step->name_en,
                    'action_url' => '/approvals', 'approval_request_id' => $request->public_id,
                ]));
            });
    }

    private function notifyRequester(ApprovalRequest $request, string $result, ?string $reason = null): void
    {
        $request->loadMissing('requester');
        $approved = $result === 'approved';
        $request->requester?->notify(new LocalSystemNotification([
            'event_key' => 'approval.'.$result, 'category' => 'approvals', 'severity' => $approved ? 'notice' : 'urgent',
            'title_ar' => $approved ? 'اكتمل اعتماد الطلب' : 'أعيد الطلب للتعديل',
            'title_en' => $approved ? 'Approval completed' : 'Request returned for revision',
            'message_ar' => $request->title_ar.($reason ? ' — '.$reason : ''),
            'message_en' => $request->title_en.($reason ? ' — '.$reason : ''),
            'action_url' => $request->source_url ?: '/approvals', 'approval_request_id' => $request->public_id,
        ]));
    }

    private function tr(string $ar, string $en): string { return app()->getLocale() === 'ar' ? $ar : $en; }
}

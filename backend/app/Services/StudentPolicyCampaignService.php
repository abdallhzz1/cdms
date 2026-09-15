<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Student;
use App\Models\StudentPolicyAssignment;
use App\Models\StudentPolicyCampaign;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StudentPolicyCampaignService
{
    public function publish(StudentPolicyCampaign $campaign, User $actor): StudentPolicyCampaign
    {
        return DB::transaction(function () use ($campaign, $actor) {
            $locked = StudentPolicyCampaign::query()->lockForUpdate()->findOrFail($campaign->id);
            if ($locked->status !== 'draft') {
                throw ValidationException::withMessages(['campaign' => ['يمكن نشر الحملة المسودة فقط.']]);
            }

            $students = Student::query()->active()
                ->where('academic_year_id', $locked->academic_year_id)
                ->whereIn('academic_level', $locked->target_levels)
                ->get(['id']);
            if ($students->isEmpty()) {
                throw ValidationException::withMessages(['target_levels' => ['لا يوجد طلبة فعالون ضمن الفئات المحددة.']]);
            }

            foreach ($students as $student) {
                StudentPolicyAssignment::firstOrCreate(['campaign_id' => $locked->id, 'student_id' => $student->id]);
            }
            $locked->document()->update(['published_at' => now()]);
            $locked->update(['status' => 'published', 'published_at' => now(), 'published_by' => $actor->id]);
            AuditLog::create(['user_id' => $actor->id, 'action' => 'student_policy.published', 'entity_type' => 'student_policy_campaign', 'entity_id' => $locked->id, 'changes' => ['students' => $students->count()]]);

            return $locked->fresh(['document', 'academicYear']);
        });
    }
}

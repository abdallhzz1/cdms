<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AuditLog;
use App\Models\StudentSchedulePortalSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudentSchedulePortalController extends Controller
{
    public function show(): JsonResponse
    {
        $setting = StudentSchedulePortalSetting::current()->load('updatedBy:id,name');

        return ApiResponse::success($this->payload($setting));
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(['is_enabled' => ['required', 'boolean']]);
        $setting = StudentSchedulePortalSetting::current();
        $previous = $setting->is_enabled;
        $setting->update([
            'is_enabled' => $data['is_enabled'],
            'updated_by' => $request->user()->id,
        ]);

        AuditLog::create([
            'user_id' => $request->user()->id,
            'action' => $setting->is_enabled ? 'student_schedule_portal.enabled' : 'student_schedule_portal.disabled',
            'entity_type' => 'student_schedule_portal',
            'entity_id' => $setting->id,
            'changes' => ['is_enabled' => ['old' => $previous, 'new' => $setting->is_enabled]],
        ]);

        return ApiResponse::success(
            $this->payload($setting->fresh()->load('updatedBy:id,name')),
            $setting->is_enabled ? 'تم تفعيل رابط جدول الطالب.' : 'تم تعطيل رابط جدول الطالب.'
        );
    }

    private function payload(StudentSchedulePortalSetting $setting): array
    {
        return [
            'is_enabled' => $setting->is_enabled,
            'public_url' => '/portal/student-lookup',
            'updated_at' => $setting->updated_at?->toIso8601String(),
            'updated_by' => $setting->updatedBy ? ['name' => $setting->updatedBy->name] : null,
        ];
    }
}

<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Course;
use App\Models\CourseReport;
use App\Models\AcademicYear;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use App\Services\Approvals\ApprovalWorkflowService;
use App\Models\User;

class CourseReportController extends Controller
{
    public function index(Course $course): JsonResponse
    {
        return ApiResponse::success([
            'reports' => $course->reports()->with([
                'academicYear:id,code,start_date,end_date,is_current',
                'preparer:id,name',
                'approver:id,name',
            ])->orderByDesc('academic_year_id')->get(),
            'academic_years' => AcademicYear::query()->orderByDesc('start_date')
                ->get(['id', 'code', 'start_date', 'end_date', 'is_current', 'status']),
        ]);
    }

    public function store(Request $request, Course $course): JsonResponse
    {
        $data = $request->validate([
            'academic_year_id' => ['required', 'integer', 'exists:academic_years,id'],
            'summary' => ['nullable', 'string', 'max:10000'],
            'achievements' => ['nullable', 'string', 'max:10000'],
            'challenges' => ['nullable', 'string', 'max:10000'],
            'improvement_plan' => ['nullable', 'string', 'max:10000'],
        ]);

        $report = CourseReport::firstOrNew([
            'course_id' => $course->id,
            'academic_year_id' => $data['academic_year_id'],
        ]);
        if ($report->exists && in_array($report->status, ['submitted', 'approved'], true)) {
            throw ValidationException::withMessages(['report' => ['لا يمكن تعديل تقرير مرسل أو معتمد.']]);
        }

        $report->fill($data);
        $report->prepared_by = $request->user()->id;
        $report->status = $report->status === 'returned' ? 'returned' : 'draft';
        $report->save();

        return ApiResponse::success($report->fresh('academicYear'), 'تم حفظ مسودة تقرير المساق.');
    }

    public function submit(Request $request, Course $course, CourseReport $report, ApprovalWorkflowService $approvals): JsonResponse
    {
        $this->assertBelongsToCourse($course, $report);
        if (!in_array($report->status, ['draft', 'returned'], true)) {
            throw ValidationException::withMessages(['report' => ['هذا التقرير مرسل أو معتمد بالفعل.']]);
        }
        if (!$report->summary || !$report->improvement_plan) {
            throw ValidationException::withMessages(['report' => ['الملخص وخطة التحسين مطلوبان قبل الإرسال.']]);
        }

        $report->update([
            'status' => 'submitted',
            'submitted_at' => now(),
            'approved_at' => null,
            'approved_by' => null,
            'review_notes' => null,
        ]);
        $approvals->submit('course_report', 'course_report', $report->id, $request->user(),
            'تقرير مساق '.$course->name_ar, 'Course report: '.($course->name_en ?: $course->code), '/courses/'.$course->id,
            ['course_id' => $course->id, 'academic_year_id' => $report->academic_year_id]);

        return ApiResponse::success($report->fresh('academicYear'), 'تم إرسال التقرير للاعتماد.');
    }

    public function approve(Request $request, Course $course, CourseReport $report, ApprovalWorkflowService $approvals): JsonResponse
    {
        $this->assertBelongsToCourse($course, $report);
        if ($report->status !== 'submitted') {
            throw ValidationException::withMessages(['report' => ['يمكن اعتماد التقارير المرسلة فقط.']]);
        }

        $data = $request->validate(['review_notes' => ['nullable', 'string', 'max:5000']]);
        $this->ensureApprovalRequest($request, $course, $report, $approvals);
        $decision = $approvals->approve('course_report', 'course_report', $report->id, $request->user(), $data['review_notes'] ?? null);
        if (! $decision['completed']) {
            return ApiResponse::success($report->fresh(['academicYear', 'approver:id,name']), app()->getLocale() === 'ar' ? 'تمت مراجعة التقرير وإرساله لمرحلة الاعتماد التالية.' : 'The report was reviewed and sent to the next approval stage.');
        }
        $report->update([
            'status' => 'approved',
            'approved_by' => $request->user()->id,
            'approved_at' => now(),
            'review_notes' => $data['review_notes'] ?? null,
        ]);

        return ApiResponse::success($report->fresh(['academicYear', 'approver:id,name']), 'تم اعتماد تقرير المساق.');
    }

    public function returnForRevision(Request $request, Course $course, CourseReport $report, ApprovalWorkflowService $approvals): JsonResponse
    {
        $this->assertBelongsToCourse($course, $report);
        if ($report->status !== 'submitted') {
            throw ValidationException::withMessages(['report' => ['يمكن إعادة التقارير المرسلة فقط.']]);
        }
        $data = $request->validate(['review_notes' => ['required', 'string', 'max:5000']]);
        $this->ensureApprovalRequest($request, $course, $report, $approvals);
        $approvals->returnForRevision('course_report', 'course_report', $report->id, $request->user(), $data['review_notes']);
        $report->update([
            'status' => 'returned',
            'review_notes' => $data['review_notes'],
            'approved_by' => $request->user()->id,
            'approved_at' => null,
        ]);

        return ApiResponse::success($report->fresh(['academicYear', 'approver:id,name']), 'تمت إعادة التقرير للتعديل.');
    }

    private function ensureApprovalRequest(Request $request, Course $course, CourseReport $report, ApprovalWorkflowService $approvals): void
    {
        if ($approvals->pending('course_report', 'course_report', $report->id)) return;
        $requester = User::findOrFail((int) $report->prepared_by);
        $approvals->submit('course_report', 'course_report', $report->id, $requester,
            'تقرير مساق '.$course->name_ar, 'Course report: '.($course->name_en ?: $course->code), '/courses/'.$course->id,
            ['course_id' => $course->id, 'academic_year_id' => $report->academic_year_id]);
    }

    private function assertBelongsToCourse(Course $course, CourseReport $report): void
    {
        abort_unless($report->course_id === $course->id, 404);
    }
}

<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AttendanceRecord;
use App\Models\AttendanceWarningNotification;
use App\Models\AuditLog;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Mail\Message;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;
use Throwable;

class AttendanceWarningController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'academic_year_id' => ['nullable', 'integer', 'exists:academic_years,id'],
            'course_id' => ['nullable', 'integer', 'exists:courses,id'],
            'student_id' => ['nullable', 'integer', 'exists:students,id'],
        ]);

        $warnings = $this->summaries($request)
            ->filter(fn (array $summary) => $summary['current_threshold'] !== null)
            ->sortByDesc('absence_percentage')
            ->values();

        return ApiResponse::success($warnings, null, [
            'policy' => [
                'days_per_credit_hour' => 5,
                'warning_thresholds' => [10, 20],
                'counted_status' => 'absent',
                'comparison' => 'greater_than',
            ],
        ]);
    }

    public function send(Request $request): JsonResponse
    {
        $data = $request->validate([
            'student_id' => ['required', 'integer', 'exists:students,id'],
            'rotation_id' => ['required', 'integer', 'exists:rotations,id'],
            'threshold_percent' => ['required', 'integer', Rule::in([10, 20])],
            'resend' => ['sometimes', 'boolean'],
        ]);

        $scopeRequest = Request::create('', 'GET', [
            'student_id' => $data['student_id'],
        ]);
        $scopeRequest->setUserResolver(fn () => $request->user());

        $summary = $this->summaries($scopeRequest)
            ->first(fn (array $item) => (int) $item['student']['id'] === (int) $data['student_id']
                && (int) $item['rotation_id'] === (int) $data['rotation_id']);

        if (! $summary) {
            return ApiResponse::error('لم يتم العثور على سجل حضور متاح ضمن نطاق صلاحياتك.', [], [], 404);
        }

        if ((float) $summary['absence_percentage'] <= (int) $data['threshold_percent']) {
            return ApiResponse::error('لا يمكن إرسال الإنذار لأن نسبة الغياب لم تتجاوز الحد المحدد.', [], [
                'absence_percentage' => $summary['absence_percentage'],
                'threshold_percent' => (int) $data['threshold_percent'],
            ], 422);
        }

        $alreadySent = AttendanceWarningNotification::query()
            ->where('student_id', $data['student_id'])
            ->where('rotation_id', $data['rotation_id'])
            ->where('threshold_percent', $data['threshold_percent'])
            ->where('delivery_status', 'sent')
            ->exists();

        if ($alreadySent && ! ($data['resend'] ?? false)) {
            return ApiResponse::error('سبق إرسال هذا الإنذار. اختر إعادة الإرسال فقط عند الحاجة.', [], [], 409);
        }

        $recipient = $summary['student']['email'];
        $notification = AttendanceWarningNotification::create([
            'student_id' => $data['student_id'],
            'rotation_id' => $data['rotation_id'],
            'academic_year_id' => $summary['academic_year']['id'] ?? null,
            'course_id' => $summary['course']['id'] ?? null,
            'threshold_percent' => $data['threshold_percent'],
            'absent_days' => $summary['absent_days'],
            'total_required_days' => $summary['total_required_days'],
            'absence_percentage' => $summary['absence_percentage'],
            'recipient_email' => $recipient,
            'delivery_status' => 'sending',
            'sent_by_user_id' => $request->user()?->id,
        ]);

        try {
            $subject = (int) $data['threshold_percent'] === 20
                ? 'إنذار غياب سريري عاجل | Urgent Clinical Attendance Warning'
                : 'تنبيه غياب سريري | Clinical Attendance Warning';
            $body = $this->messageBody($summary, (int) $data['threshold_percent']);

            Mail::raw($body, function (Message $message) use ($recipient, $subject) {
                $message->to($recipient)->subject($subject);
            });

            $notification->update([
                'delivery_status' => 'sent',
                'failure_code' => null,
                'sent_at' => now(),
            ]);

            $this->audit($request, $notification, 'attendance_warning.sent');

            return ApiResponse::success([
                'id' => $notification->id,
                'recipient_email' => $recipient,
                'threshold_percent' => (int) $data['threshold_percent'],
                'sent_at' => $notification->fresh()->sent_at?->toIso8601String(),
            ], 'تم إرسال إنذار الغياب إلى البريد الجامعي للطالب.');
        } catch (Throwable $exception) {
            report($exception);
            $notification->update([
                'delivery_status' => 'failed',
                'failure_code' => 'mail_transport_failed',
            ]);
            $this->audit($request, $notification, 'attendance_warning.failed');

            return ApiResponse::error(
                'تعذر إرسال الإنذار عبر البريد الجامعي. لم يتم اعتبار الإنذار مرسلاً؛ تحقق من إعدادات البريد أو حاول لاحقاً.',
                [],
                [],
                502,
            );
        }
    }

    /** @return Collection<int, array<string, mixed>> */
    private function summaries(Request $request): Collection
    {
        $query = AttendanceRecord::query()
            ->with([
                'student:id,university_number,full_name_ar,full_name_en,academic_level',
                'session:id,rotation_block_id,session_date',
                'session.rotationBlock:id,rotation_id,department_id',
                'session.rotationBlock.rotation:id,academic_year_id,course_id,academic_level,name,code',
                'session.rotationBlock.rotation.course:id,code,name_ar,name_en,credit_hours',
                'session.rotationBlock.rotation.academicYear:id,code,start_date,end_date',
            ])
            ->whereHas('session.rotationBlock.rotation.course');

        $query->whereIn('student_id', $this->applyStudentAccessScope(Student::query())->select('students.id'));

        $departmentId = $this->getClinicalOperationsDepartmentId();
        if ($departmentId) {
            $query->whereHas('session.rotationBlock', fn ($block) => $block->where('department_id', $departmentId));
        }

        $user = $request->user();
        $roles = $user?->roles()->pluck('code') ?? collect();
        if ($this->isSupervisorOnly($roles)) {
            $personId = $user?->person?->id;
            $studentIds = StudentClinicalAssignment::query()
                ->where('supervisor_id', $personId ?: 0)
                ->whereHas('distributionVersion', fn ($distribution) => $distribution->where('status', 'published')->where('is_current', true))
                ->pluck('student_id');
            $query->whereIn('student_id', $studentIds);
        }

        $query
            ->when($request->filled('student_id'), fn ($q) => $q->where('student_id', $request->integer('student_id')))
            ->when($request->filled('course_id'), fn ($q) => $q->whereHas('session.rotationBlock.rotation', fn ($rotation) => $rotation->where('course_id', $request->integer('course_id'))))
            ->when($request->filled('academic_year_id'), fn ($q) => $q->whereHas('session.rotationBlock.rotation', fn ($rotation) => $rotation->where('academic_year_id', $request->integer('academic_year_id'))));

        $records = $query->get()->filter(fn (AttendanceRecord $record) => $record->student
            && $record->session?->session_date
            && $record->session?->rotationBlock?->rotation?->course);

        $keys = $records->map(function (AttendanceRecord $record) {
            $rotation = $record->session->rotationBlock->rotation;

            return [(int) $record->student_id, (int) $rotation->id];
        });

        $history = AttendanceWarningNotification::query()
            ->whereIn('student_id', $keys->pluck(0)->unique())
            ->whereIn('rotation_id', $keys->pluck(1)->unique())
            ->where('delivery_status', 'sent')
            ->latest('sent_at')
            ->get()
            ->groupBy(fn (AttendanceWarningNotification $item) => $item->student_id.'|'.$item->rotation_id.'|'.$item->threshold_percent)
            ->map(fn (Collection $items) => $items->first());

        return $records
            ->groupBy(function (AttendanceRecord $record) {
                $rotation = $record->session->rotationBlock->rotation;

                return $record->student_id.'|'.$rotation->id;
            })
            ->map(function (Collection $group) use ($history) {
                /** @var AttendanceRecord $first */
                $first = $group->first();
                $student = $first->student;
                $rotation = $first->session->rotationBlock->rotation;
                $course = $rotation->course;
                $requiredDays = max(0, (int) $course->credit_hours * 5);

                if ($requiredDays === 0) {
                    return null;
                }

                $statusDates = fn (string $status) => $group
                    ->where('status', $status)
                    ->map(fn (AttendanceRecord $record) => $record->session->session_date->toDateString())
                    ->unique()
                    ->count();

                $absentDays = $statusDates('absent');
                $percentage = round(($absentDays / $requiredDays) * 100, 2);
                $currentThreshold = $percentage > 20 ? 20 : ($percentage > 10 ? 10 : null);
                $domain = trim((string) config('group_registration.student_email_domain', 'students.hebron.edu'));
                $email = $student->university_number.'@'.$domain;
                $historyKey = fn (int $threshold) => $student->id.'|'.$rotation->id.'|'.$threshold;

                return [
                    'student' => [
                        'id' => $student->id,
                        'university_number' => $student->university_number,
                        'full_name_ar' => $student->full_name_ar,
                        'full_name_en' => $student->full_name_en,
                        'academic_level' => $student->academic_level,
                        'email' => $email,
                    ],
                    'rotation_id' => $rotation->id,
                    'rotation_name' => $rotation->name,
                    'course' => [
                        'id' => $course->id,
                        'code' => $course->code,
                        'name_ar' => $course->name_ar,
                        'name_en' => $course->name_en,
                        'credit_hours' => (int) $course->credit_hours,
                    ],
                    'academic_year' => $rotation->academicYear ? [
                        'id' => $rotation->academicYear->id,
                        'name' => $rotation->academicYear->code,
                    ] : null,
                    'total_required_days' => $requiredDays,
                    'recorded_days' => $group->map(fn (AttendanceRecord $record) => $record->session->session_date->toDateString())->unique()->count(),
                    'present_days' => $statusDates('present'),
                    'absent_days' => $absentDays,
                    'late_days' => $statusDates('late'),
                    'excused_days' => $statusDates('excused'),
                    'absence_percentage' => $percentage,
                    'current_threshold' => $currentThreshold,
                    'last_sent' => [
                        '10' => $this->historyPayload($history->get($historyKey(10))),
                        '20' => $this->historyPayload($history->get($historyKey(20))),
                    ],
                ];
            })
            ->filter()
            ->values();
    }

    private function historyPayload(?AttendanceWarningNotification $notification): ?array
    {
        return $notification ? [
            'id' => $notification->id,
            'sent_at' => $notification->sent_at?->toIso8601String(),
            'sent_by_user_id' => $notification->sent_by_user_id,
        ] : null;
    }

    private function messageBody(array $summary, int $threshold): string
    {
        $studentName = $summary['student']['full_name_ar'];
        $courseName = $summary['course']['name_ar'];
        $severity = $threshold === 20 ? 'إنذار عاجل' : 'تنبيه أولي';

        return <<<TEXT
الطالب/ة {$studentName} المحترم/ة،

{$severity}: بلغت نسبة غيابك المسجلة في مساق {$courseName} ({$summary['course']['code']}) نسبة {$summary['absence_percentage']}%.
عدد أيام الغياب: {$summary['absent_days']} من أصل {$summary['total_required_days']} يوماً تدريبياً معتمداً للمساق (الساعات المعتمدة × 5 أيام).

يرجى مراجعة مساعد البحث والتدريس أو إدارة الدائرة السريرية فوراً للتحقق من السجل واتخاذ الإجراء اللازم.

Dear Student,
Your recorded absence in {$summary['course']['name_en']} ({$summary['course']['code']}) has exceeded the {$threshold}% attendance-warning threshold and is currently {$summary['absence_percentage']}% ({$summary['absent_days']} of {$summary['total_required_days']} required clinical days).
Please contact the Research and Teaching Assistant or the Clinical Department administration promptly.

Clinical Department Management System
Hebron University
TEXT;
    }

    private function audit(Request $request, AttendanceWarningNotification $notification, string $action): void
    {
        AuditLog::create([
            'user_id' => $request->user()?->id,
            'action' => $action,
            'entity_type' => AttendanceWarningNotification::class,
            'entity_id' => $notification->id,
            'student_id' => $notification->student_id,
            'changes' => [
                'rotation_id' => $notification->rotation_id,
                'threshold_percent' => $notification->threshold_percent,
                'absence_percentage' => $notification->absence_percentage,
                'recipient_email' => $notification->recipient_email,
                'delivery_status' => $notification->delivery_status,
                'failure_code' => $notification->failure_code,
            ],
        ]);
    }

    private function isSupervisorOnly(Collection $roles): bool
    {
        return $roles->contains('CLINICAL_SUPERVISOR')
            && ! $roles->intersect(['SYS_ADMIN', 'CLINICAL_DIRECTOR', 'DEPARTMENT_HEAD', 'DEAN', 'VICE_DEAN'])->count();
    }
}

<?php

namespace App\Http\Controllers\Api\V1;

use App\DTOs\ClinicalScheduleItemDTO;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AuditLog;
use App\Models\CourseScheduleBlockActivity;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroupAssignment;
use App\Models\StudentScheduleOtpChallenge;
use App\Models\StudentSchedulePortalSetting;
use App\Services\Distribution\ClinicalScheduleDateCalculator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PublicStudentScheduleController extends Controller
{
    public function __construct(private ClinicalScheduleDateCalculator $dateCalculator) {}

    public function requestOtp(Request $request): JsonResponse
    {
        $this->ensurePortalEnabled();
        $data = $request->validate([
            'university_number' => ['required', 'string', 'max:20', 'regex:/^[0-9]+$/'],
        ]);

        $student = Student::where('university_number', $data['university_number'])->first();
        if (!$student) {
            throw ValidationException::withMessages([
                'university_number' => ['تعذر متابعة الطلب. يرجى التواصل مع إدارة الدائرة السريرية للتحقق من بياناتك.'],
            ]);
        }
        if ($student->academic_registration_status !== 'registered') {
            return ApiResponse::error(
                'يجب أن تقوم بالتسجيل الأكاديمي أولاً قبل الاستعلام عن جدولك السريري.',
                ['code' => ['registration_required']],
                [],
                403
            );
        }

        if (! config('group_registration.otp_enabled')) {
            $accessToken = Str::random(80);
            StudentScheduleOtpChallenge::create([
                'student_id' => $student->id,
                'challenge_token_hash' => hash('sha256', Str::random(64)),
                'otp_hash' => Hash::make(Str::random(32)),
                'expires_at' => now()->addMinutes(config('group_registration.session_ttl_minutes')),
                'verified_at' => now(),
                'consumed_at' => now(),
                'access_token_hash' => hash('sha256', $accessToken),
                'access_expires_at' => now()->addMinutes(config('group_registration.session_ttl_minutes')),
                'request_ip_hash' => hash_hmac('sha256', (string) $request->ip(), (string) config('app.key')),
            ]);
            Log::warning('Student schedule OTP bypass used', ['student_id' => $student->id]);

            return ApiResponse::success([
                'otp_required' => false,
                'access_token' => $accessToken,
                'expires_in_seconds' => config('group_registration.session_ttl_minutes') * 60,
            ], 'تم فتح جلسة فحص مؤقتة دون إرسال رمز تحقق.');
        }

        $otp = (string) random_int(100000, 999999);
        $challengeToken = Str::random(64);
        $challenge = StudentScheduleOtpChallenge::create([
            'student_id' => $student->id,
            'challenge_token_hash' => hash('sha256', $challengeToken),
            'otp_hash' => Hash::make($otp),
            'expires_at' => now()->addMinutes(config('group_registration.otp_ttl_minutes')),
            'request_ip_hash' => hash_hmac('sha256', (string) $request->ip(), (string) config('app.key')),
        ]);

        $email = $student->university_number.'@'.config('group_registration.student_email_domain');
        try {
            Mail::raw(
                "رمز التحقق الخاص بعرض جدولك السريري هو: {$otp}\n\nصلاحية الرمز ".config('group_registration.otp_ttl_minutes')." دقائق. لا تشارك الرمز مع أي شخص.\n\nClinical Department - Hebron University",
                fn ($message) => $message->to($email)->subject('رمز التحقق لعرض الجدول السريري')
            );
        } catch (\Throwable $exception) {
            $challenge->delete();
            Log::error('Student schedule OTP delivery failed', [
                'student_id' => $student->id,
                'exception_class' => $exception::class,
            ]);
            return ApiResponse::error(
                'تعذر إرسال رمز التحقق. يرجى التواصل مع إدارة الدائرة السريرية للتحقق من بياناتك أو حالة حسابك.',
                ['code' => ['otp_delivery_failed']],
                [],
                503
            );
        }

        return ApiResponse::success([
            'otp_required' => true,
            'challenge_token' => $challengeToken,
            'email_hint' => substr($student->university_number, 0, 3)
                .str_repeat('*', max(0, strlen($student->university_number) - 3))
                .'@'.config('group_registration.student_email_domain'),
            'expires_in_seconds' => config('group_registration.otp_ttl_minutes') * 60,
        ], 'تم إرسال رمز التحقق إلى بريدك الجامعي.');
    }

    public function verifyOtp(Request $request): JsonResponse
    {
        $this->ensurePortalEnabled();
        $data = $request->validate([
            'challenge_token' => ['required', 'string', 'size:64'],
            'otp' => ['required', 'digits:6'],
        ]);

        [$accessToken, $error] = DB::transaction(function () use ($data): array {
            $challenge = StudentScheduleOtpChallenge::where(
                'challenge_token_hash',
                hash('sha256', $data['challenge_token'])
            )->lockForUpdate()->first();

            if (!$challenge || $challenge->consumed_at || $challenge->expires_at->isPast()
                || $challenge->attempts >= config('group_registration.max_otp_attempts')) {
                return [null, 'رمز التحقق غير صالح أو انتهت صلاحيته. اطلب رمزاً جديداً.'];
            }
            if (!Hash::check($data['otp'], $challenge->otp_hash)) {
                $challenge->increment('attempts');
                return [null, 'رمز التحقق غير صحيح.'];
            }

            $token = Str::random(80);
            $challenge->update([
                'verified_at' => now(),
                'consumed_at' => now(),
                'access_token_hash' => hash('sha256', $token),
                'access_expires_at' => now()->addMinutes(config('group_registration.session_ttl_minutes')),
            ]);

            return [$token, null];
        });

        if (!$accessToken) {
            throw ValidationException::withMessages(['otp' => [$error]]);
        }

        return ApiResponse::success([
            'access_token' => $accessToken,
            'expires_in_seconds' => config('group_registration.session_ttl_minutes') * 60,
        ], 'تم التحقق بنجاح.');
    }

    public function schedule(Request $request): JsonResponse
    {
        $this->ensurePortalEnabled();
        $data = $request->validate(['access_token' => ['required', 'string', 'size:80']]);
        $challenge = StudentScheduleOtpChallenge::with('student')
            ->where('access_token_hash', hash('sha256', $data['access_token']))
            ->whereNotNull('verified_at')
            ->where('access_expires_at', '>', now())
            ->first();

        if (!$challenge) {
            abort(401, 'انتهت جلسة التحقق. يرجى طلب رمز جديد.');
        }
        $student = $challenge->student;
        if (!$student || $student->academic_registration_status !== 'registered') {
            abort(403, 'لا يمكنك عرض الجدول. يرجى التواصل مع إدارة الدائرة السريرية.');
        }

        $assignments = StudentClinicalAssignment::where('student_id', $student->id)
            ->whereHas('distributionVersion', fn ($query) => $query
                ->where('status', 'published')->where('is_current', true))
            ->with([
                'distributionVersion',
                'rotationBlock.rotation.course',
                'rotationBlock.rotation.academicYear',
                'rotationBlock.rotation.clinicalPeriod',
                'studentSubgroup.group',
                'trainingSite',
                'department',
                'supervisor',
            ])
            ->get()
            ->sortBy([
                fn ($left, $right) => strcmp(
                    (string) $left->rotationBlock?->rotation?->start_date,
                    (string) $right->rotationBlock?->rotation?->start_date
                ),
                fn ($left, $right) => ($left->rotationBlock?->from_week ?? 0) <=> ($right->rotationBlock?->from_week ?? 0),
            ])->values();

        $firstAssignment = $assignments->first();
        $membership = StudentGroupAssignment::current()
            ->where('student_id', $student->id)
            ->when($firstAssignment?->student_subgroup_id, fn ($query, $subgroupId) => $query->where('student_subgroup_id', $subgroupId))
            ->with(['group', 'subgroup'])
            ->latest('id')
            ->first();
        $subgroup = $firstAssignment?->studentSubgroup ?? $membership?->subgroup;
        $group = $subgroup?->group ?? $membership?->group;

        $members = collect();
        if ($subgroup) {
            $members = StudentGroupAssignment::current()
                ->where('student_subgroup_id', $subgroup->id)
                ->with('student:id,full_name_ar,full_name_en')
                ->get()
                ->pluck('student')
                ->filter();

            if ($members->isEmpty()) {
                $memberIds = StudentClinicalAssignment::where('student_subgroup_id', $subgroup->id)
                    ->whereHas('distributionVersion', fn ($query) => $query
                        ->where('status', 'published')->where('is_current', true))
                    ->distinct()->pluck('student_id');
                $members = Student::whereIn('id', $memberIds)->get(['id', 'full_name_ar', 'full_name_en']);
            }
        }

        $schedule = $assignments->map(function (StudentClinicalAssignment $assignment): array {
            $item = ClinicalScheduleItemDTO::fromAssignment($assignment, $this->dateCalculator);
            $course = $assignment->rotationBlock?->rotation?->course;

            return [
                'item_type' => 'clinical',
                'activity' => null,
                'course' => $course ? [
                    'code' => $course->code,
                    'name_ar' => $course->name_ar,
                    'name_en' => $course->name_en,
                ] : [
                    'code' => $item['rotation']['code'] ?? null,
                    'name_ar' => $item['rotation']['name'] ?? null,
                    'name_en' => $item['rotation']['name'] ?? null,
                ],
                'academic_year' => $assignment->rotationBlock?->rotation?->academicYear?->code,
                'clinical_period' => $assignment->rotationBlock?->rotation?->clinicalPeriod ? [
                    'id' => $assignment->rotationBlock->rotation->clinicalPeriod->id,
                    'code' => $assignment->rotationBlock->rotation->clinicalPeriod->code,
                    'name_ar' => $assignment->rotationBlock->rotation->clinicalPeriod->name_ar,
                    'name_en' => $assignment->rotationBlock->rotation->clinicalPeriod->name_en,
                    'sequence' => $assignment->rotationBlock->rotation->clinicalPeriod->sequence,
                ] : null,
                'block' => $item['block'],
                'training_site' => $item['training_site'],
                'department' => $item['department'],
                'supervisor' => $item['supervisor'] ? [
                    'full_name_ar' => $item['supervisor']['full_name_ar'],
                    'full_name_en' => $item['supervisor']['full_name_en'],
                    'name' => $item['supervisor']['name'],
                ] : null,
            ];
        });

        if ($group) {
            $activities = CourseScheduleBlockActivity::query()
                ->where('activity_type', '!=', 'clinical')
                ->whereHas('distributionVersion', fn ($query) => $query
                    ->where('status', 'published')->where('is_current', true))
                ->whereHas('distributionVersion.rotation', fn ($query) => $query
                    ->where('academic_year_id', $group->academic_year_id)
                    ->where('academic_level', $student->academic_level))
                ->with(['distributionVersion.rotation.course', 'distributionVersion.rotation.academicYear', 'distributionVersion.rotation.clinicalPeriod', 'rotationBlock'])
                ->get()
                ->filter(fn (CourseScheduleBlockActivity $activity) => $activity->activity_scope === 'all'
                    || in_array($group->name, $activity->main_group_codes ?? [], true))
                ->map(function (CourseScheduleBlockActivity $activity): array {
                    $block = $activity->rotationBlock;
                    $rotation = $activity->distributionVersion?->rotation;
                    $course = $rotation?->course;
                    $startDate = $rotation?->start_date && $block
                        ? $this->dateCalculator->calculateBlockStartDate($rotation->start_date, $block->from_week)
                        : null;
                    $endDate = $rotation?->start_date && $block
                        ? $this->dateCalculator->calculateBlockEndDate($rotation->start_date, $block->to_week)
                        : null;

                    return [
                        'item_type' => 'activity',
                        'activity' => [
                            'type' => $activity->activity_type,
                            'label' => $activity->activity_label,
                        ],
                        'course' => $course ? [
                            'code' => $course->code,
                            'name_ar' => $course->name_ar,
                            'name_en' => $course->name_en,
                        ] : null,
                        'academic_year' => $rotation?->academicYear?->code,
                        'clinical_period' => $rotation?->clinicalPeriod ? [
                            'id' => $rotation->clinicalPeriod->id,
                            'code' => $rotation->clinicalPeriod->code,
                            'name_ar' => $rotation->clinicalPeriod->name_ar,
                            'name_en' => $rotation->clinicalPeriod->name_en,
                            'sequence' => $rotation->clinicalPeriod->sequence,
                        ] : null,
                        'block' => $block ? [
                            'block_code' => $block->block_code,
                            'from_week' => $block->from_week,
                            'to_week' => $block->to_week,
                            'start_date' => $startDate,
                            'end_date' => $endDate,
                        ] : null,
                        'training_site' => null,
                        'department' => null,
                        'supervisor' => null,
                    ];
                });

            $schedule = $schedule->concat($activities)->sortBy([
                fn ($left, $right) => strcmp((string) ($left['block']['start_date'] ?? ''), (string) ($right['block']['start_date'] ?? '')),
                fn ($left, $right) => ($left['block']['from_week'] ?? 0) <=> ($right['block']['from_week'] ?? 0),
            ])->values();
        }

        AuditLog::create([
            'action' => 'student_schedule.viewed',
            'entity_type' => 'student_schedule',
            'entity_id' => $student->id,
            'student_id' => $student->id,
            'changes' => ['assignment_count' => $schedule->count()],
        ]);

        return ApiResponse::success([
            'student' => [
                'name' => $student->full_name_ar,
                'name_en' => $student->full_name_en,
                'university_number' => $student->university_number,
                'academic_level' => $student->academic_level,
            ],
            'group' => $group ? ['name' => $group->name] : null,
            'subgroup' => $subgroup ? ['name' => $subgroup->name] : null,
            'members' => $members->sortBy('full_name_ar')->values()->map(fn ($member) => [
                'name' => $member->full_name_ar,
                'name_en' => $member->full_name_en,
                'is_current_student' => $member->id === $student->id,
            ]),
            'schedule' => $schedule,
        ]);
    }

    private function ensurePortalEnabled(): void
    {
        if (!StudentSchedulePortalSetting::current()->is_enabled) {
            abort(403, 'بوابة جدول الطالب متوقفة حالياً من إدارة الدائرة السريرية. يرجى المحاولة لاحقاً.');
        }
    }
}

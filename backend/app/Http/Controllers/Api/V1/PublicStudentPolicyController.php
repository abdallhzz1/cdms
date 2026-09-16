<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Mail\StudentPolicyOtpMail;
use App\Models\AuditLog;
use App\Models\Student;
use App\Models\StudentPolicyAssignment;
use App\Models\StudentPolicyCampaign;
use App\Models\StudentPolicyOtpChallenge;
use App\Services\StudentPolicyAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class PublicStudentPolicyController extends Controller
{
    public function show(StudentPolicyCampaign $campaign): JsonResponse
    {
        $campaign->load(['document', 'academicYear']);
        return ApiResponse::success(['public_id' => $campaign->public_id, 'status' => $campaign->status,
            'deadline' => $campaign->deadline?->toDateString(), 'academic_year' => $campaign->academicYear?->code,
            'title_ar' => $campaign->document->title_ar, 'title_en' => $campaign->document->title_en,
            'version_label' => $campaign->document->version_label,
            'has_english_document' => filled($campaign->document->storage_path_en)]);
    }

    public function requestOtp(Request $request, StudentPolicyCampaign $campaign): JsonResponse
    {
        $data = $request->validate(['university_number' => ['required', 'string', 'max:20', 'regex:/^[0-9]+$/']]);
        abort_unless($campaign->status === 'published', 409, 'الحملة غير متاحة حالياً.');
        $student = Student::where('university_number', $data['university_number'])->first();
        $assignment = $student ? StudentPolicyAssignment::where('campaign_id', $campaign->id)->where('student_id', $student->id)->first() : null;
        $generic = 'إذا كانت بياناتك مشمولة بالحملة فسيصل رمز التحقق إلى بريدك الجامعي.';
        if (! $assignment || ! $student) {
            return ApiResponse::success(['challenge_token' => Str::random(64), 'expires_in_seconds' => 600], $generic);
        }

        $otp = (string) random_int(100000, 999999);
        $challengeToken = Str::random(64);
        $challenge = StudentPolicyOtpChallenge::create(['challenge_token_hash' => hash('sha256', $challengeToken), 'campaign_id' => $campaign->id,
            'assignment_id' => $assignment->id, 'otp_hash' => hash('sha256', $otp), 'expires_at' => now()->addMinutes(10)]);
        try {
            Mail::to($student->resolvedUniversityEmail())->send(new StudentPolicyOtpMail($otp, $campaign->document->title_ar));
        } catch (\Throwable $exception) {
            $challenge->delete();
            Log::error('Student policy OTP delivery failed', ['campaign_id' => $campaign->id, 'student_id' => $student->id, 'exception' => $exception::class]);
            return ApiResponse::error('تعذر إرسال رمز التحقق حالياً. يرجى المحاولة لاحقاً.', ['code' => ['otp_delivery_failed']], [], 503);
        }
        return ApiResponse::success(['challenge_token' => $challengeToken, 'email_hint' => substr($student->university_number, 0, 3).'***@students.hebron.edu', 'expires_in_seconds' => 600], $generic);
    }

    public function verifyOtp(Request $request, StudentPolicyCampaign $campaign): JsonResponse
    {
        $data = $request->validate(['challenge_token' => ['required', 'string', 'size:64'], 'otp' => ['required', 'digits:6']]);
        [$token, $assignment] = DB::transaction(function () use ($data, $campaign) {
            $challenge = StudentPolicyOtpChallenge::where('campaign_id', $campaign->id)->where('challenge_token_hash', hash('sha256', $data['challenge_token']))->lockForUpdate()->first();
            if (! $challenge || ! $challenge->assignment_id || $challenge->expires_at->isPast() || $challenge->attempts >= 5 || ! hash_equals((string) $challenge->otp_hash, hash('sha256', $data['otp']))) {
                if ($challenge) $challenge->increment('attempts');
                throw ValidationException::withMessages(['otp' => ['رمز التحقق غير صحيح أو انتهت صلاحيته.']]);
            }
            $access = Str::random(80);
            $challenge->update(['verified_at' => now(), 'access_token_hash' => hash('sha256', $access), 'access_expires_at' => now()->addMinutes(20), 'otp_hash' => null]);
            return [$access, $challenge->assignment()->with('student')->firstOrFail()];
        });
        return ApiResponse::success(['access_token' => $token, 'expires_in_seconds' => 1200,
            'student' => ['name' => $assignment->student->full_name_ar, 'university_number' => $assignment->student->university_number],
            'opened' => (bool) $assignment->opened_at, 'opened_ar' => (bool) ($assignment->opened_ar_at ?: $assignment->opened_at),
            'opened_en' => (bool) $assignment->opened_en_at, 'has_english_document' => filled($assignment->campaign->document->storage_path_en),
            'acknowledged' => (bool) $assignment->acknowledged_at]);
    }

    public function opened(Request $request, StudentPolicyCampaign $campaign, StudentPolicyAccessService $access): JsonResponse
    {
        $data = $request->validate(['language' => ['required', Rule::in(['ar', 'en'])]]);
        $assignment = $access->assignmentForToken($campaign, $access->tokenFrom($request));
        $document = $assignment->campaign->document;
        abort_if($data['language'] === 'en' && blank($document->storage_path_en), 404);
        $field = $data['language'] === 'en' ? 'opened_en_at' : 'opened_ar_at';
        if (! $assignment->{$field}) $assignment->update([$field => now()]);
        $assignment->refresh();
        $allOpened = (bool) $assignment->opened_ar_at && (blank($document->storage_path_en) || (bool) $assignment->opened_en_at);
        if ($allOpened && ! $assignment->opened_at) $assignment->update(['opened_at' => now()]);
        return ApiResponse::success(['opened_ar' => (bool) $assignment->opened_ar_at, 'opened_en' => (bool) $assignment->opened_en_at, 'all_opened' => $allOpened]);
    }

    public function document(Request $request, StudentPolicyCampaign $campaign, StudentPolicyAccessService $access): BinaryFileResponse
    {
        $assignment = $access->assignmentForToken($campaign, $access->tokenFrom($request));
        $english = $request->query('language') === 'en';
        $path = $english ? $assignment->campaign->document->storage_path_en : $assignment->campaign->document->storage_path;
        abort_unless($path && Storage::disk('local')->exists($path), 404);
        return response()->file(Storage::disk('local')->path($path), [
            'Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="code-of-conduct-'.($english ? 'en' : 'ar').'.pdf"',
            'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function acknowledge(Request $request, StudentPolicyCampaign $campaign, StudentPolicyAccessService $access): JsonResponse
    {
        $data = $request->validate(['typed_name' => ['required', 'string', 'max:200'], 'paper_signature_understood' => ['accepted']]);
        abort_unless($campaign->status === 'published', 409, 'الحملة غير متاحة حالياً.');
        $assignment = $access->assignmentForToken($campaign, $access->tokenFrom($request));
        if ($assignment->acknowledged_at) return ApiResponse::success(['acknowledged_at' => $assignment->acknowledged_at->toIso8601String()], 'تم تسجيل إقرارك سابقاً.');
        $document = $assignment->campaign->document;
        throw_unless($assignment->opened_ar_at || ($assignment->opened_at && blank($document->storage_path_en)), ValidationException::withMessages(['document_ar' => ['يجب فتح النسخة العربية وقراءتها أولاً.']]));
        throw_unless(blank($document->storage_path_en) || $assignment->opened_en_at, ValidationException::withMessages(['document_en' => ['يجب فتح النسخة الإنجليزية وقراءتها أولاً.']]));
        throw_unless($access->namesMatch($assignment, $data['typed_name']), ValidationException::withMessages(['typed_name' => ['يرجى كتابة اسمك مطابقاً لبيانات الطالب.']]));
        $assignment->update(['acknowledged_at' => now(), 'acknowledged_name' => trim($data['typed_name']),
            'acknowledged_version' => $document->version_label, 'acknowledged_document_sha256' => $document->sha256,
            'acknowledged_document_sha256_en' => $document->sha256_en,
            'acknowledged_ip_hash' => hash_hmac('sha256', (string) $request->ip(), (string) config('app.key')),
            'acknowledged_user_agent_hash' => hash('sha256', (string) $request->userAgent())]);
        AuditLog::create(['action' => 'student_policy.acknowledged', 'entity_type' => 'student_policy_assignment', 'entity_id' => $assignment->id,
            'student_id' => $assignment->student_id, 'changes' => ['version' => $document->version_label, 'sha256_ar' => $document->sha256, 'sha256_en' => $document->sha256_en]]);
        return ApiResponse::success(['acknowledged_at' => $assignment->fresh()->acknowledged_at?->toIso8601String()], 'تم تسجيل إقرار القراءة. اطبع النسخة ووقّعها بخط اليد وسلمها للكلية.');
    }
}

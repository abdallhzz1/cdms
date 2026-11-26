<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Services\ClinicalStudentFeedback;
use App\Services\ClinicalStudentPortalIdentity;
use Illuminate\Http\Request;

class ClinicalStudentPortalController extends Controller
{
    public function __construct(private ClinicalStudentPortalIdentity $identity, private ClinicalStudentFeedback $feedback) {}

    public function identity(Request $request)
    {
        $student = $this->identity->student($request);

        return ApiResponse::success(['student' => $student?->only(['full_name_ar', 'full_name_en', 'university_number'])]);
    }

    public function requestOtp(Request $request)
    {
        $data = $request->validate(['university_number' => ['required', 'string', 'regex:/^[0-9]{4,20}$/']]);

        return ApiResponse::success(['challenge' => $this->identity->requestCode($data['university_number'])]);
    }

    public function verifyOtp(Request $request)
    {
        $data = $request->validate(['challenge' => ['required', 'string', 'size:64'], 'otp' => ['required', 'digits:6'], 'remember' => ['required', 'boolean']]);
        $studentId = $this->identity->verify($data['challenge'], $data['otp']);
        if (! $studentId) {
            return ApiResponse::error(__('clinical_feedback.invalid_code'), [], [], 422);
        }

        return ApiResponse::success(null)->withCookie($this->identity->createSession((int) $studentId, $data['remember'], $request));
    }

    public function marks(Request $request)
    {
        $student = $this->identity->student($request);
        abort_unless($student, 401);

        return ApiResponse::success(['slots' => $this->feedback->forStudent($student)]);
    }

    public function participate(Request $request)
    {
        $student = $this->identity->student($request);
        abort_unless($student, 401);
        $data = $request->validate(['key' => ['required', 'string', 'size:64'], 'experience' => ['required', 'integer', 'between:0,5'], 'supervision' => ['required', 'integer', 'between:0,5'], 'comment' => ['nullable', 'string', 'max:2000']]);
        $this->feedback->participate($student, $data['key'], (int) $data['experience'], (int) $data['supervision'], $data['comment'] ?? null);

        return ApiResponse::success(null);
    }

    public function forget(Request $request)
    {
        $this->identity->forget($request);

        return ApiResponse::success(null)->withCookie(cookie(ClinicalStudentPortalIdentity::COOKIE, '', -1, '/api/v1/public/clinical-student', null, app()->isProduction() || $request->isSecure(), true, false, 'Lax'));
    }
}

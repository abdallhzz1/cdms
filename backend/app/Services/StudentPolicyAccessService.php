<?php

namespace App\Services;

use App\Models\StudentPolicyAssignment;
use App\Models\StudentPolicyCampaign;
use App\Models\StudentPolicyOtpChallenge;
use Illuminate\Http\Request;

class StudentPolicyAccessService
{
    public function assignmentForToken(StudentPolicyCampaign $campaign, string $token): StudentPolicyAssignment
    {
        $challenge = StudentPolicyOtpChallenge::query()
            ->where('campaign_id', $campaign->id)
            ->where('access_token_hash', hash('sha256', $token))
            ->whereNotNull('verified_at')->where('access_expires_at', '>', now())->first();
        abort_unless($challenge?->assignment_id, 401, 'انتهت جلسة التحقق. يرجى طلب رمز جديد.');
        return StudentPolicyAssignment::with(['student', 'campaign.document'])->findOrFail($challenge->assignment_id);
    }

    public function tokenFrom(Request $request): string
    {
        $token = (string) ($request->bearerToken() ?: $request->input('access_token') ?: $request->query('access_token'));
        abort_if(strlen($token) !== 80, 401, 'انتهت جلسة التحقق. يرجى طلب رمز جديد.');
        return $token;
    }

    public function namesMatch(StudentPolicyAssignment $assignment, string $typedName): bool
    {
        $normalize = fn (?string $name) => mb_strtolower(preg_replace('/\s+/u', ' ', trim((string) $name)));
        $typed = $normalize($typedName);
        return $typed !== '' && in_array($typed, array_filter([$normalize($assignment->student->full_name_ar), $normalize($assignment->student->full_name_en)]), true);
    }
}

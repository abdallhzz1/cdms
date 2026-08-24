<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AuditLog;
use App\Models\GroupRegistrationCycle;
use App\Models\GroupRegistrationOtpChallenge;
use App\Models\Student;
use App\Models\StudentGroupAssignment;
use App\Models\StudentGroupRoster;
use App\Models\StudentSubgroup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PublicGroupRegistrationController extends Controller
{
    public function cycle(GroupRegistrationCycle $cycle): JsonResponse
    {
        return ApiResponse::success([
            'public_id'=>$cycle->public_id,
            'academic_level'=>$cycle->academic_level,
            'academic_year'=>$cycle->academicYear?->code,
            'status'=>$cycle->isOpen() ? 'open' : 'closed',
        ]);
    }

    public function requestOtp(Request $request, GroupRegistrationCycle $cycle): JsonResponse
    {
        $data = $request->validate(['university_number'=>['required','string','max:20','regex:/^[0-9]+$/']]);
        if (!$cycle->isOpen()) abort(409, 'فترة التسجيل الذاتي مغلقة حالياً.');

        $student = Student::where('university_number', $data['university_number'])->first();
        $roster = $student ? StudentGroupRoster::where('group_registration_cycle_id',$cycle->id)->where('student_id',$student->id)->first() : null;
        if (!$student || !$roster) {
            throw ValidationException::withMessages(['university_number'=>['تعذر متابعة الطلب. يرجى التواصل مع إدارة الدائرة السريرية للتحقق من بياناتك.']]);
        }
        if ($student->academic_registration_status !== 'registered') {
            return ApiResponse::error('يجب أن تقوم بالتسجيل الأكاديمي أولاً قبل اختيار المجموعة.', ['code'=>['registration_required']], [], 403);
        }

        $otp = (string) random_int(100000, 999999);
        $challengeToken = Str::random(64);
        $challenge = GroupRegistrationOtpChallenge::create([
            'group_registration_cycle_id'=>$cycle->id,
            'student_id'=>$student->id,
            'challenge_token_hash'=>hash('sha256',$challengeToken),
            'otp_hash'=>Hash::make($otp),
            'expires_at'=>now()->addMinutes(config('group_registration.otp_ttl_minutes')),
            'request_ip_hash'=>hash_hmac('sha256',(string)$request->ip(),(string)config('app.key')),
        ]);
        $email = $student->university_number.'@'.config('group_registration.student_email_domain');
        try {
            Mail::raw(
                "رمز التحقق الخاص بتسجيل المجموعات السريرية هو: {$otp}\n\nصلاحية الرمز ".config('group_registration.otp_ttl_minutes')." دقائق. لا تشارك الرمز مع أي شخص.\n\nClinical Department - Hebron University",
                fn ($message) => $message->to($email)->subject('رمز التحقق لتسجيل المجموعات السريرية')
            );
        } catch (\Throwable $e) {
            $challenge->delete();
            Log::error('Group registration OTP delivery failed', ['student_id'=>$student->id,'cycle_id'=>$cycle->id,'exception_class'=>$e::class]);
            return ApiResponse::error('تعذر إرسال رمز التحقق. يرجى التواصل مع إدارة الدائرة السريرية للتحقق من بياناتك أو حالة حسابك.', ['code'=>['otp_delivery_failed']], [], 503);
        }

        return ApiResponse::success([
            'challenge_token'=>$challengeToken,
            'email_hint'=>substr($student->university_number,0,3).str_repeat('*',max(0,strlen($student->university_number)-3)).'@'.config('group_registration.student_email_domain'),
            'expires_in_seconds'=>config('group_registration.otp_ttl_minutes')*60,
        ], 'تم إرسال رمز التحقق إلى بريدك الجامعي.');
    }

    public function verifyOtp(Request $request, GroupRegistrationCycle $cycle): JsonResponse
    {
        $data = $request->validate(['challenge_token'=>['required','string','size:64'], 'otp'=>['required','digits:6']]);
        [$accessToken, $otpError] = DB::transaction(function () use ($data, $cycle) {
            $challenge = GroupRegistrationOtpChallenge::where('group_registration_cycle_id',$cycle->id)
                ->where('challenge_token_hash',hash('sha256',$data['challenge_token']))->lockForUpdate()->first();
            if (!$challenge || $challenge->consumed_at || $challenge->expires_at->isPast() || $challenge->attempts >= config('group_registration.max_otp_attempts')) {
                return [null, 'رمز التحقق غير صالح أو انتهت صلاحيته. اطلب رمزاً جديداً.'];
            }
            if (!Hash::check($data['otp'],$challenge->otp_hash)) {
                $challenge->increment('attempts');
                return [null, 'رمز التحقق غير صحيح.'];
            }
            $token = Str::random(80);
            $challenge->update(['verified_at'=>now(), 'consumed_at'=>now(), 'access_token_hash'=>hash('sha256',$token), 'access_expires_at'=>now()->addMinutes(config('group_registration.session_ttl_minutes'))]);
            return [$token, null];
        });
        if (!$accessToken) throw ValidationException::withMessages(['otp'=>[$otpError]]);
        return ApiResponse::success(['access_token'=>$accessToken,'expires_in_seconds'=>config('group_registration.session_ttl_minutes')*60], 'تم التحقق بنجاح.');
    }

    public function options(Request $request, GroupRegistrationCycle $cycle): JsonResponse
    {
        [$challenge,$roster] = $this->session($request,$cycle);
        $current = StudentGroupAssignment::where('student_id',$challenge->student_id)->where('academic_year_id',$cycle->academic_year_id)->whereNull('valid_until')->first();
        $subgroups = $roster->group->subgroups()->where('is_active',true)
            ->withCount(['assignments as current_students_count'=>fn($q)=>$q->whereNull('valid_until')])->orderBy('name')->get()
            ->map(fn($sg)=>[
                'id'=>$sg->id,'name'=>$sg->name,'capacity'=>(int)($sg->capacity ?: $sg->max_size ?: $cycle->default_capacity),
                'occupied'=>(int)$sg->current_students_count,
                'available'=>max(0,(int)($sg->capacity ?: $sg->max_size ?: $cycle->default_capacity)-(int)$sg->current_students_count),
                'is_full'=>(int)$sg->current_students_count >= (int)($sg->capacity ?: $sg->max_size ?: $cycle->default_capacity),
                'is_selected'=>$current?->student_subgroup_id === $sg->id,
            ]);
        return ApiResponse::success([
            'student'=>['name'=>$challenge->student->full_name_ar,'university_number'=>$challenge->student->university_number,'academic_level'=>$challenge->student->academic_level],
            'main_group'=>$roster->group->name,'subgroups'=>$subgroups,
        ]);
    }

    public function select(Request $request, GroupRegistrationCycle $cycle): JsonResponse
    {
        $data=$request->validate(['access_token'=>['required','string','size:80'],'subgroup_id'=>['required','integer','exists:student_subgroups,id']]);
        [$challenge,$roster]=$this->session($request,$cycle,$data['access_token']);
        $assignment=DB::transaction(function() use($data,$challenge,$roster,$cycle){
            $subgroup=StudentSubgroup::whereKey($data['subgroup_id'])->lockForUpdate()->firstOrFail();
            if(!$subgroup->is_active || $subgroup->student_group_id!==$roster->student_group_id) throw ValidationException::withMessages(['subgroup_id'=>['المجموعة المختارة غير متاحة لك.']]);
            Student::whereKey($challenge->student_id)->lockForUpdate()->firstOrFail();
            $current=StudentGroupAssignment::where('student_id',$challenge->student_id)->where('academic_year_id',$cycle->academic_year_id)->whereNull('valid_until')->lockForUpdate()->first();
            if($current?->student_subgroup_id===$subgroup->id) return $current;
            $capacity=(int)($subgroup->capacity ?: $subgroup->max_size ?: $cycle->default_capacity);
            $occupied=StudentGroupAssignment::where('student_subgroup_id',$subgroup->id)->whereNull('valid_until')->count();
            if($occupied >= $capacity) throw ValidationException::withMessages(['subgroup_id'=>['اكتملت سعة المجموعة. يرجى اختيار مجموعة أخرى.']]);
            if($current) $current->update(['valid_until'=>now()->toDateString(),'change_reason'=>'student_self_change']);
            return StudentGroupAssignment::create(['student_id'=>$challenge->student_id,'academic_year_id'=>$cycle->academic_year_id,'student_group_id'=>$roster->student_group_id,'student_subgroup_id'=>$subgroup->id,'valid_from'=>now()->toDateString(),'change_reason'=>'student_self_registration','data_source'=>'public_otp_portal']);
        });
        $this->audit('group_registration.student_selected',$assignment->id,$challenge->student_id,['subgroup_id'=>$assignment->student_subgroup_id]);
        return ApiResponse::success(['subgroup_id'=>$assignment->student_subgroup_id],'تم حجز مقعدك بنجاح.');
    }

    public function withdraw(Request $request, GroupRegistrationCycle $cycle): JsonResponse
    {
        [$challenge]=$this->session($request,$cycle);
        DB::transaction(function() use($challenge,$cycle){
            Student::whereKey($challenge->student_id)->lockForUpdate()->firstOrFail();
            StudentGroupAssignment::where('student_id',$challenge->student_id)->where('academic_year_id',$cycle->academic_year_id)->whereNull('valid_until')->lockForUpdate()->update(['valid_until'=>now()->toDateString(),'change_reason'=>'student_self_withdrawal']);
        });
        $this->audit('group_registration.student_withdrew',$cycle->id,$challenge->student_id);
        return ApiResponse::success(null,'تم الانسحاب من المجموعة وأصبح المقعد متاحاً.');
    }

    private function session(Request $request, GroupRegistrationCycle $cycle, ?string $provided=null): array
    {
        if(!$cycle->isOpen()) abort(409,'فترة التسجيل الذاتي مغلقة حالياً.');
        $token=$provided ?: (string)$request->input('access_token');
        $challenge=GroupRegistrationOtpChallenge::with('student')->where('group_registration_cycle_id',$cycle->id)->where('access_token_hash',hash('sha256',$token))->whereNotNull('verified_at')->where('access_expires_at','>',now())->first();
        if(!$challenge) abort(401,'انتهت جلسة التحقق. يرجى طلب رمز جديد.');
        $roster=StudentGroupRoster::with('group')->where('group_registration_cycle_id',$cycle->id)->where('student_id',$challenge->student_id)->first();
        if(!$roster || $challenge->student->academic_registration_status!=='registered') abort(403,'لا يمكنك متابعة التسجيل. يرجى التواصل مع إدارة الدائرة السريرية.');
        return [$challenge,$roster];
    }
    private function audit(string $action,int $id,int $studentId,array $changes=[]): void { AuditLog::create(['action'=>$action,'entity_type'=>'group_registration','entity_id'=>$id,'student_id'=>$studentId,'changes'=>$changes]); }
}

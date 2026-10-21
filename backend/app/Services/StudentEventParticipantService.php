<?php

namespace App\Services;

use App\Models\Student;
use App\Models\StudentEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StudentEventParticipantService
{
    public function byNumber(string $number, StudentEvent $event): array
    {
        $clinical = Student::where('university_number', $number)->first();
        $basic = DB::table('basic_students')->where('university_number', $number)->where('is_active', true)->first();
        $basicLevel = $basic ? $this->basicLevel((int) $basic->id) : null;
        $clinicalEligible = $clinical && $clinical->academic_registration_status === 'registered'
            && in_array($clinical->academic_level, $event->eligible_levels, true);
        $basicEligible = $basicLevel && in_array($basicLevel, $event->eligible_levels, true);

        if ($clinicalEligible && $basicEligible)
            throw ValidationException::withMessages(['university_number' => [__('student_events.ambiguous_identity')]]);
        if ($clinicalEligible) return $this->clinical($clinical);
        if ($basicEligible) return $this->basic($basic, $basicLevel);
        throw ValidationException::withMessages(['university_number' => [__($clinical || $basicLevel
            ? 'student_events.ineligible' : 'student_events.student_missing')]]);
    }

    public function identity(Request $request, StudentEvent $event, ?string $accessToken = null): ?array
    {
        $clinical = app(StudentPublicIdentityService::class)->resolve($request, $accessToken);
        $basicToken = $accessToken ?: (string) $request->cookie(BasicAttendanceService::COOKIE);
        $basic = app(BasicAttendanceService::class)->identity($basicToken);
        $basicLevel = $basic ? $this->basicLevel((int) $basic->id) : null;
        $clinicalEligible = $clinical?->academic_registration_status === 'registered'
            && in_array($clinical->academic_level, $event->eligible_levels, true);
        $basicEligible = $basicLevel && in_array($basicLevel, $event->eligible_levels, true);
        if ($clinicalEligible && $basicEligible)
            throw ValidationException::withMessages(['student' => [__('student_events.ambiguous_identity')]]);
        if ($clinicalEligible) return $this->clinical($clinical);
        if ($basicEligible) return $this->basic($basic, $basicLevel);
        return null;
    }

    private function basicLevel(int $studentId): ?string
    {
        $year = DB::table('academic_years')->where('is_current', true)->value('code');
        if (!$year) return null;
        $levels = DB::table('basic_enrollments as e')
            ->join('basic_sections as s', 's.id', '=', 'e.section_id')
            ->join('basic_courses as c', 'c.id', '=', 's.course_id')
            ->where('e.student_id', $studentId)->where('e.is_active', true)
            ->where('s.is_active', true)->where('c.is_active', true)
            ->whereNull('s.archived_at')->whereNull('c.archived_at')
            ->where('s.academic_year', $year)->distinct()->pluck('c.academic_level');
        if ($levels->count() > 1)
            throw ValidationException::withMessages(['university_number' => [__('student_events.ambiguous_level')]]);
        return $levels->first();
    }

    private function clinical(Student $student): array
    {
        return ['source' => 'clinical', 'id' => $student->id, 'number' => $student->university_number,
            'name_ar' => $student->full_name_ar, 'name_en' => $student->full_name_en,
            'level' => $student->academic_level, 'email' => $student->resolvedUniversityEmail()];
    }

    private function basic(object $student, string $level): array
    {
        return ['source' => 'basic', 'id' => $student->id, 'number' => $student->university_number,
            'name_ar' => $student->name, 'name_en' => null, 'level' => $level,
            'email' => $student->email ?? DB::table('basic_students')->where('id', $student->id)->value('email')];
    }
}

<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Explicit, transactional deletion of basic-sciences attendance data. */
class BasicAttendanceDeletionService
{
    public function __construct(private BasicAttendanceService $attendance) {}

    public function purgeCourse(int $courseId, int $actorId, string $confirmation, string $reason): void
    {
        DB::transaction(function () use ($courseId, $actorId, $confirmation, $reason) {
            $course = DB::table('basic_courses')->where('id', $courseId)->lockForUpdate()->first();
            abort_unless($course, 404);
            $this->confirm($confirmation, $course->code);
            $sections = DB::table('basic_sections')->where('course_id', $courseId)->orderBy('id')->lockForUpdate()->get();
            $sectionIds = $sections->pluck('id')->all();
            if ($this->hasActiveLecture($sectionIds)) $this->activeLectureError();

            $studentIds = collect();
            $deletedLectures = 0;
            foreach ($sections as $section) {
                $studentIds = $studentIds->merge($this->sectionStudentIds($section->id));
                $deletedLectures += $this->deleteSectionData($section->id);
            }
            DB::table('basic_courses')->where('id', $courseId)->delete();
            $this->deleteOrphanStudents($studentIds->unique()->all());
            $this->attendance->audit(null, $actorId, 'course.purged', [
                'course_id' => $courseId, 'code' => $course->code,
                'sections' => count($sectionIds), 'lectures' => $deletedLectures, 'reason' => $reason,
            ]);
        });
    }

    public function purgeSection(int $sectionId, int $actorId, string $confirmation, string $reason): void
    {
        DB::transaction(function () use ($sectionId, $actorId, $confirmation, $reason) {
            $reference = DB::table('basic_sections')->where('id', $sectionId)->first();
            abort_unless($reference, 404);
            DB::table('basic_courses')->where('id', $reference->course_id)->lockForUpdate()->first();
            $section = DB::table('basic_sections')->where('id', $sectionId)->lockForUpdate()->first();
            abort_unless($section, 404);
            $this->confirm($confirmation, $section->number);
            if ($this->hasActiveLecture([$sectionId])) $this->activeLectureError();
            $studentIds = $this->sectionStudentIds($sectionId);
            $deletedLectures = $this->deleteSectionData($sectionId);
            $this->deleteOrphanStudents($studentIds);
            $this->attendance->audit(null, $actorId, 'section.purged', [
                'section_id' => $sectionId, 'course_id' => $section->course_id,
                'number' => $section->number, 'lectures' => $deletedLectures, 'reason' => $reason,
            ]);
        });
    }

    public function removeStudentFromSection(int $sectionId, int $studentId, int $actorId, string $reason): void
    {
        DB::transaction(function () use ($sectionId, $studentId, $actorId, $reason) {
            $section = DB::table('basic_sections')->where('id', $sectionId)->lockForUpdate()->first();
            abort_unless($section && ! $section->archived_at, 404);
            $student = DB::table('basic_students')->where('id', $studentId)->lockForUpdate()->first();
            $enrollment = DB::table('basic_enrollments')->where('section_id', $sectionId)
                ->where('student_id', $studentId)->first();
            abort_unless($student && $enrollment, 404);
            if ($this->hasActiveLecture([$sectionId])) $this->activeLectureError();

            $sessionIds = DB::table('basic_lecture_sessions')->where('section_id', $sectionId)->pluck('id');
            $claimIds = DB::table('basic_scan_claims')->whereIn('session_id', $sessionIds)
                ->where('student_id', $studentId)->pluck('id');
            DB::table('basic_otp_challenges')->whereIn('scan_claim_id', $claimIds)->delete();
            DB::table('basic_scan_claims')->whereIn('id', $claimIds)->delete();
            $removedRecords = DB::table('basic_lecture_records')->whereIn('session_id', $sessionIds)
                ->where('student_id', $studentId)->delete();
            DB::table('basic_absence_notifications')->where('section_id', $sectionId)
                ->where('student_id', $studentId)->delete();
            DB::table('basic_enrollments')->where('id', $enrollment->id)->delete();
            $this->deleteOrphanStudents([$studentId]);
            $this->attendance->audit(null, $actorId, 'student.removed_from_section', [
                'section_id' => $sectionId, 'student_id' => $studentId,
                'university_number' => $student->university_number,
                'removed_records' => $removedRecords, 'reason' => $reason,
            ]);
        });
    }

    private function deleteSectionData(int $sectionId): int
    {
        $sessionIds = DB::table('basic_lecture_sessions')->where('section_id', $sectionId)->pluck('id');
        if ($sessionIds->isNotEmpty()) {
            $claimIds = DB::table('basic_scan_claims')->whereIn('session_id', $sessionIds)->pluck('id');
            DB::table('basic_otp_challenges')->whereIn('pending_session_id', $sessionIds)
                ->orWhereIn('scan_claim_id', $claimIds)->delete();
            DB::table('basic_scan_claims')->whereIn('session_id', $sessionIds)->delete();
            DB::table('basic_attendance_audits')->whereIn('session_id', $sessionIds)->delete();
            DB::table('basic_lecture_records')->whereIn('session_id', $sessionIds)->delete();
            DB::table('basic_lecture_sessions')->whereIn('id', $sessionIds)->delete();
        }
        DB::table('basic_absence_notifications')->where('section_id', $sectionId)->delete();
        DB::table('basic_enrollments')->where('section_id', $sectionId)->delete();
        DB::table('basic_section_lecturers')->where('section_id', $sectionId)->delete();
        DB::table('basic_sections')->where('id', $sectionId)->delete();
        return $sessionIds->count();
    }

    private function sectionStudentIds(int $sectionId): array
    {
        $enrolled = DB::table('basic_enrollments')->where('section_id', $sectionId)->pluck('student_id');
        $recorded = DB::table('basic_lecture_records as record')
            ->join('basic_lecture_sessions as lecture', 'lecture.id', '=', 'record.session_id')
            ->where('lecture.section_id', $sectionId)->pluck('record.student_id');
        return $enrolled->merge($recorded)->unique()->all();
    }

    private function deleteOrphanStudents(array $studentIds): void
    {
        foreach (array_unique($studentIds) as $studentId) {
            if (DB::table('basic_enrollments')->where('student_id', $studentId)->exists()
                || DB::table('basic_lecture_records')->where('student_id', $studentId)->exists()) continue;
            DB::table('basic_absence_notifications')->where('student_id', $studentId)->delete();
            DB::table('basic_otp_challenges')->where('student_id', $studentId)->delete();
            DB::table('basic_scan_claims')->where('student_id', $studentId)->delete();
            DB::table('basic_trusted_devices')->where('student_id', $studentId)->delete();
            DB::table('basic_students')->where('id', $studentId)->delete();
        }
    }

    private function hasActiveLecture(array $sectionIds): bool
    {
        return $sectionIds !== [] && DB::table('basic_lecture_sessions')
            ->whereIn('section_id', $sectionIds)->where('active_guard', 1)->exists();
    }

    private function confirm(string $actual, string $expected): void
    {
        if ($actual !== $expected) throw ValidationException::withMessages([
            'confirm' => [__('basic_attendance.archive_confirm_mismatch')],
        ]);
    }

    private function activeLectureError(): never
    {
        throw ValidationException::withMessages(['session' => [__('basic_attendance.archive_active_session')]]);
    }
}

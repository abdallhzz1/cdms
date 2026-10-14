<?php

namespace App\Services\ClinicalAttendance;

use App\Models\AuditLog;
use App\Models\ClinicalUniversityAttendanceRecord;
use App\Models\ClinicalUniversityLecture;
use App\Models\ClinicalUniversitySession;
use App\Models\Person;
use App\Models\Student;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class UniversityQrAttendanceService
{
    public function __construct(private UniversityAttendanceRoster $roster, private QrTokenService $tokens) {}

    public function open(ClinicalUniversityLecture $lecture, Person $person, User $actor, string $date): ClinicalUniversitySession
    {
        abort_unless(config('clinical_attendance.enabled'), 403, 'تسجيل QR متوقف حاليًا.');
        abort_unless($date === today()->toDateString(), 422, 'يمكن فتح QR في يوم المحاضرة فقط.');
        return DB::transaction(function () use ($lecture, $person, $actor, $date): ClinicalUniversitySession {
            $locked = ClinicalUniversityLecture::query()->whereKey($lecture->id)->lockForUpdate()->firstOrFail();
            abort_unless($locked->is_active && (int) $locked->supervisor_person_id === (int) $person->id
                && $date >= $locked->starts_on->toDateString() && $date <= $locked->ends_on->toDateString()
                && strtolower(Carbon::parse($date)->format('l')) === $locked->weekday, 403);
            $session = $locked->sessions()->whereDate('session_date', $date)->lockForUpdate()->first();
            if ($session) {
                abort_unless($session->qr_state === 'open', 409, 'يوجد كشف يدوي أو كشف QR مغلق لهذه المحاضرة.');
                return $session;
            }
            $members = $this->roster->members($locked, $date);
            abort_if($members->isEmpty(), 422, 'لا يوجد طلاب مرتبطون بالمجموعة الرئيسية في هذا التاريخ.');
            $session = ClinicalUniversitySession::create([
                'clinical_university_lecture_id' => $locked->id, 'session_date' => $date,
                'supervisor_person_id' => $person->id, 'recorded_by_user_id' => $actor->id,
                'qr_public_id' => (string) Str::uuid(), 'qr_state' => 'open', 'qr_opened_at' => now(),
            ]);
            foreach ($members as $member) {
                ClinicalUniversityAttendanceRecord::create([
                    'clinical_university_session_id' => $session->id,
                    'student_id' => $member->student_id,
                    'student_subgroup_id' => $member->student_subgroup_id,
                    'status' => null,
                ]);
            }
            $this->audit($actor->id, 'clinical_university.qr_opened', $session, null, ['roster_count' => $members->count()]);
            return $session;
        });
    }

    public function payload(ClinicalUniversitySession $session): array
    {
        abort_unless($session->qr_state === 'open' && $session->qr_public_id, 409, 'رمز هذه المحاضرة مغلق.');
        return $this->tokens->issueUniversity($session);
    }

    public function close(ClinicalUniversityLecture $lecture, Person $person, User $actor, string $date): ClinicalUniversitySession
    {
        return DB::transaction(function () use ($lecture, $person, $actor, $date): ClinicalUniversitySession {
            $session = ClinicalUniversitySession::query()->where('clinical_university_lecture_id', $lecture->id)
                ->whereDate('session_date', $date)->lockForUpdate()->firstOrFail();
            abort_unless((int) $session->supervisor_person_id === (int) $person->id, 403);
            if ($session->qr_state === 'closed') return $session;
            abort_unless($session->qr_state === 'open', 409, 'هذا الكشف ليس كشف QR مفتوحًا.');
            $absent = 0;
            foreach ($session->records()->whereNull('status')->lockForUpdate()->get() as $record) {
                $record->update(['status' => 'absent', 'recorded_by_user_id' => $actor->id]);
                $this->audit($actor->id, 'clinical_university.attendance_recorded', $session, $record->student_id,
                    ['previous_status' => null, 'status' => 'absent', 'source' => 'qr_close']);
                $absent++;
            }
            $session->update(['qr_state' => 'closed', 'qr_closed_at' => now()]);
            $this->audit($actor->id, 'clinical_university.qr_closed', $session, null, ['absent_count' => $absent]);
            return $session;
        });
    }

    public function scan(Request $request, Student $student, array $claims): array
    {
        abort_unless($claims['p'] === 'check_in' && isset($claims['u']), 422, 'رمز المحاضرة غير صالح.');
        return DB::transaction(function () use ($request, $student, $claims): array {
            $session = ClinicalUniversitySession::query()->whereKey($claims['u'])->lockForUpdate()->first();
            abort_unless($session && $session->qr_public_id === $claims['s'] && $session->qr_state === 'open'
                && $session->session_date->toDateString() === today()->toDateString(), 422, 'انتهت جلسة الحضور أو أُغلقت.');
            $record = $session->records()->where('student_id', $student->id)->lockForUpdate()->first();
            abort_unless($record, 403, 'لست مسجلًا في المجموعة الرئيسية لهذه المحاضرة.');
            if ($record->status !== null) return ['operation' => 'check_in', 'recorded_at' => $record->updated_at?->toIso8601String(),
                'group' => $session->lecture?->group?->name, 'training_site' => 'الجامعة', 'idempotent' => true];
            $late = $session->qr_opened_at && now()->gt($session->qr_opened_at->copy()->addMinutes(max(0, (int) config('clinical_attendance.late_after_minutes', 15))));
            $record->update(['status' => $late ? 'late' : 'present']);
            $this->audit(null, 'clinical_university.qr_scanned', $session, $student->id,
                ['status' => $record->status, 'ip_hash' => hash_hmac('sha256', (string) $request->ip(), (string) config('app.key'))]);
            return ['operation' => 'check_in', 'recorded_at' => $record->updated_at?->toIso8601String(),
                'group' => $session->lecture?->group?->name, 'training_site' => 'الجامعة', 'idempotent' => false];
        });
    }

    private function audit(?int $userId, string $action, ClinicalUniversitySession $session, ?int $studentId, array $changes): void
    {
        AuditLog::create(['user_id' => $userId, 'action' => $action,
            'entity_type' => ClinicalUniversitySession::class, 'entity_id' => $session->id,
            'student_id' => $studentId, 'changes' => ['lecture_id' => $session->clinical_university_lecture_id,
                'date' => $session->session_date->toDateString(), ...$changes]]);
    }
}

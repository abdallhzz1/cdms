<?php

namespace App\Services\ClinicalAttendance;

use App\Models\AttendanceRecord;
use App\Models\ClinicalQrAttendanceRoster;
use App\Models\ClinicalQrAttendanceSession;
use App\Models\ClinicalQrScanEvent;
use App\Models\ClinicalSession;
use App\Models\Person;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class QrAttendanceService
{
    public function __construct(private QrTokenService $tokens) {}

    public function open(User $actor, int $assignmentId, string $date): ClinicalQrAttendanceSession
    {
        $person = $actor->person; abort_unless($person, 403, 'لا يوجد ملف مشرف سريري مرتبط بالحساب.');
        return DB::transaction(function () use ($person, $assignmentId, $date) {
            $assignment = $this->ownedAssignment($person, $assignmentId);
            $key = $this->assignmentKey($assignment);
            $existing = ClinicalQrAttendanceSession::where(['assignment_key' => $key, 'session_date' => $date, 'active_guard' => 1])->lockForUpdate()->first();
            if ($existing) return $existing->load('roster.student', 'trainingSite');
            $session = ClinicalQrAttendanceSession::create(['public_id' => (string) Str::uuid(), 'assignment_key' => $key, 'student_clinical_assignment_id' => $assignment->id, 'rotation_block_id' => $assignment->rotation_block_id, 'training_site_id' => $assignment->training_site_id, 'supervisor_id' => $person->id, 'session_date' => $date, 'state' => 'check_in_open', 'active_guard' => 1, 'check_in_opened_at' => now()]);
            $this->groupAssignments($assignment)->pluck('student_id')->unique()->each(fn ($studentId) => $session->roster()->create(['student_id' => $studentId]));
            $this->event($session, null, 'check_in', 'session_opened', null, request());
            return $session->load('roster.student', 'trainingSite');
        });
    }

    public function transition(User $actor, ClinicalQrAttendanceSession $session, string $action, ?string $reason = null): ClinicalQrAttendanceSession
    {
        return DB::transaction(function () use ($actor, $session, $action, $reason) {
            $session = ClinicalQrAttendanceSession::lockForUpdate()->findOrFail($session->id);
            abort_unless((int) $session->supervisor_id === (int) $actor->person?->id || $actor->can('permission', ['attendance.qr.reopen_finalized']), 403);
            $allowed = match ($action) {
                'close_check_in' => $session->state === 'check_in_open',
                'reopen_check_in' => $session->state === 'check_in_closed' && filled($reason),
                'open_check_out' => $session->state === 'check_in_closed',
                'close_check_out' => $session->state === 'check_out_open' && filled($reason),
                'finalize' => $session->state === 'check_out_open',
                default => false,
            };
            abort_unless($allowed, 422, 'لا يمكن تنفيذ هذا الإجراء في حالة الجلسة الحالية.');
            if ($action === 'finalize') return $this->finalizeLocked($actor, $session);
            $update = match ($action) {
                'close_check_in' => ['state' => 'check_in_closed', 'check_in_closed_at' => now()],
                'reopen_check_in' => ['state' => 'check_in_open', 'check_in_closed_at' => null],
                'open_check_out' => ['state' => 'check_out_open', 'check_out_opened_at' => now()],
                'close_check_out' => ['state' => 'check_in_closed', 'check_out_closed_at' => now()],
            };
            $session->update($update + ['version' => $session->version + 1]);
            $this->event($session, null, null, $action, null, request());
            return $session->fresh()->load('roster.student', 'trainingSite');
        });
    }

    public function scan(Request $request, Student $student, string $token): array
    {
        abort_unless(config('clinical_attendance.enabled'), 403, 'تسجيل الحضور عبر الكاميرا متوقف حالياً.');
        $claims = $this->tokens->validate($token);
        return DB::transaction(function () use ($request, $student, $claims) {
            $session = ClinicalQrAttendanceSession::where('public_id', $claims['s'])->lockForUpdate()->first();
            if (!$session) abort(422, 'رمز الحضور غير صالح.');
            $expectedState = $claims['p'] === 'check_in' ? 'check_in_open' : 'check_out_open';
            if ($session->state !== $expectedState) { $this->event($session, $student, $claims['p'], 'phase_closed', $claims['n'], $request); abort(422, 'هذه المرحلة مغلقة حالياً.'); }
            $roster = ClinicalQrAttendanceRoster::where('clinical_qr_attendance_session_id', $session->id)->where('student_id', $student->id)->lockForUpdate()->first();
            if (!$roster) { $this->event($session, $student, $claims['p'], 'not_in_roster', $claims['n'], $request); abort(403, 'لا يمكنك التسجيل في جلسة الحضور الحالية.'); }
            $column = $claims['p'] === 'check_in' ? 'checked_in_at' : 'checked_out_at';
            if ($roster->{$column}) return $this->scanResponse($session, $roster, $claims['p'], true);
            if ($claims['p'] === 'check_out' && !$roster->checked_in_at) { $this->event($session, $student, 'check_out', 'missing_check_in', $claims['n'], $request); abort(422, 'لا يمكن تسجيل الخروج قبل تسجيل الدخول.'); }
            $roster->update([$column => now(), 'outcome' => 'present', 'recording_source' => 'qr']);
            $this->event($session, $student, $claims['p'], 'accepted', $claims['n'], $request);
            return $this->scanResponse($session, $roster->fresh(), $claims['p'], false);
        });
    }

    public function override(User $actor, ClinicalQrAttendanceSession $session, ClinicalQrAttendanceRoster $roster, array $data): ClinicalQrAttendanceRoster
    {
        abort_unless((int) $session->id === (int) $roster->clinical_qr_attendance_session_id, 404);
        abort_unless((int) $session->supervisor_id === (int) $actor->person?->id, 403);
        return DB::transaction(function () use ($actor, $session, $roster, $data) {
            $locked = ClinicalQrAttendanceRoster::lockForUpdate()->findOrFail($roster->id);
            $locked->update(['outcome' => $data['status'], 'manual_reason' => trim($data['reason']), 'manual_actor_user_id' => $actor->id, 'recording_source' => 'manual_override', 'checked_in_at' => $data['check_in_at'] ?? $locked->checked_in_at, 'checked_out_at' => $data['check_out_at'] ?? $locked->checked_out_at, 'is_incomplete' => !empty($data['check_in_at'] ?? $locked->checked_in_at) && empty($data['check_out_at'] ?? $locked->checked_out_at)]);
            $this->event($session, $locked->student, null, 'manual_override', null, request());
            return $locked->fresh('student');
        });
    }

    public function payload(ClinicalQrAttendanceSession $session): array
    {
        abort_unless(in_array($session->state, ['check_in_open', 'check_out_open'], true), 422, 'لا يوجد رمز نشط في هذه المرحلة.');
        return $this->tokens->issue($session);
    }

    private function finalizeLocked(User $actor, ClinicalQrAttendanceSession $session): ClinicalQrAttendanceSession
    {
        $clinical = ClinicalSession::firstOrCreate(['rotation_block_id' => $session->rotation_block_id, 'training_site_id' => $session->training_site_id, 'session_date' => $session->session_date->toDateString()], ['title' => 'QR clinical attendance']);
        foreach ($session->roster()->lockForUpdate()->get() as $roster) {
            $status = $roster->outcome === 'excused' ? 'excused' : ($roster->checked_in_at ? ($roster->outcome === 'late' ? 'late' : 'present') : 'absent');
            AttendanceRecord::updateOrCreate(['clinical_session_id' => $clinical->id, 'student_id' => $roster->student_id], ['clinical_qr_attendance_roster_id' => $roster->id, 'status' => $status, 'excuse_note' => $roster->manual_reason, 'check_in_at' => $roster->checked_in_at, 'check_out_at' => $roster->checked_out_at, 'recording_source' => $roster->recording_source, 'is_incomplete' => (bool) $roster->checked_in_at && !$roster->checked_out_at, 'recorded_by_user_id' => $actor->id]);
        }
        $session->update(['clinical_session_id' => $clinical->id, 'state' => 'finalized', 'active_guard' => null, 'finalized_at' => now(), 'finalized_by_user_id' => $actor->id, 'version' => $session->version + 1]);
        $this->event($session, null, null, 'finalized', null, request());
        return $session->fresh()->load('roster.student', 'trainingSite');
    }

    private function ownedAssignment(Person $person, int $id): StudentClinicalAssignment { return StudentClinicalAssignment::whereKey($id)->where('supervisor_id', $person->id)->whereHas('distributionVersion', fn ($q) => $q->where('status', 'published')->where('is_current', true))->firstOrFail(); }
    private function groupAssignments(StudentClinicalAssignment $a) { return StudentClinicalAssignment::query()->where('distribution_version_id', $a->distribution_version_id)->where('rotation_block_id', $a->rotation_block_id)->where('training_site_id', $a->training_site_id)->where('supervisor_id', $a->supervisor_id)->when($a->student_subgroup_id, fn ($q, $id) => $q->where('student_subgroup_id', $id)); }
    private function assignmentKey(StudentClinicalAssignment $a): string { return implode('|', [$a->distribution_version_id, $a->rotation_block_id, $a->training_site_id, $a->supervisor_id, $a->student_subgroup_id ?? 0]); }
    private function scanResponse(ClinicalQrAttendanceSession $session, ClinicalQrAttendanceRoster $roster, string $phase, bool $idempotent): array { return ['operation' => $phase, 'recorded_at' => $phase === 'check_in' ? $roster->checked_in_at?->toIso8601String() : $roster->checked_out_at?->toIso8601String(), 'group' => $session->assignment?->studentSubgroup?->name, 'training_site' => $session->trainingSite?->name_ar, 'idempotent' => $idempotent]; }
    private function event(?ClinicalQrAttendanceSession $s, ?Student $student, ?string $phase, string $result, ?string $nonce, Request $request): void { ClinicalQrScanEvent::create(['clinical_qr_attendance_session_id' => $s?->id, 'student_id' => $student?->id, 'phase' => $phase, 'result_code' => $result, 'qr_nonce_hash' => $nonce ? hash('sha256', $nonce) : null, 'ip_hash' => hash_hmac('sha256', (string) $request->ip(), (string) config('app.key')), 'user_agent' => Str::limit((string) $request->userAgent(), 500, ''), 'occurred_at' => now()]); }
}

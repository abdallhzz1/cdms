<?php

namespace App\Services;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class BasicAttendanceService
{
    public const SCAN_CLAIM_COOKIE = 'basic_attendance_claim';
    public const SCAN_CLAIM_MINUTES = 10;
    public const COOKIE = 'basic_attendance_device';

    public function dates(object $row): object
    {
        foreach (['opened_at', 'phase_expires_at', 'auto_finalize_at', 'finalized_at', 'check_in_at', 'check_out_at', 'created_at', 'updated_at'] as $field) {
            if (isset($row->$field)) $row->$field = Carbon::parse($row->$field)->toIso8601String();
        }
        return $row;
    }

    public function manager(User $user): bool
    {
        return app(AuthorizationService::class)->can($user, 'basic_attendance.manage');
    }

    public function sections(User $user)
    {
        $query = DB::table('basic_sections as s')->join('basic_courses as c', 'c.id', '=', 's.course_id')->whereNull('s.archived_at')->whereNull('c.archived_at');
        if (! $this->manager($user)) $query->whereExists(fn ($q) => $q->selectRaw('1')->from('basic_section_lecturers as l')->whereColumn('l.section_id', 's.id')->where('l.user_id', $user->id));
        return $query;
    }

    public function section(User $user, int $id): object
    {
        $section = $this->sections($user)->where('s.id', $id)->select('s.*', 'c.name as course_name', 'c.code as course_code', 'c.academic_level')->first();
        abort_unless($section, 404);
        return $section;
    }

    public function session(User $user, int $id): object
    {
        $session = DB::table('basic_lecture_sessions')->where('id', $id)->whereNull('archived_at')->first();
        abort_unless($session, 404); $this->section($user, $session->section_id);
        return $session;
    }

    public function audit(?int $session, ?int $user, string $event, array $details = []): void
    {
        DB::table('basic_attendance_audits')->insert(['session_id' => $session, 'user_id' => $user, 'event' => $event, 'details' => json_encode($details, JSON_UNESCAPED_UNICODE), 'created_at' => now()]);
    }

    public function start(User $user, int $sectionId, array $data): int
    {
        $this->section($user, $sectionId);
        $this->finalizeExpiredForSection($sectionId);
        return DB::transaction(function () use ($user, $sectionId, $data) {
            $section = DB::table('basic_sections')->where('id', $sectionId)->lockForUpdate()->first();
            $course = $section ? DB::table('basic_courses')->where('id', $section->course_id)->lockForUpdate()->first() : null;
            abort_unless($section && ! $section->archived_at && $section->is_active && $course && ! $course->archived_at && $course->is_active, 409);
            $lecturerIds = DB::table('basic_section_lecturers')->where('section_id', $sectionId)->pluck('user_id');
            $lecturerId = $this->manager($user) ? ($data['lecturer_id'] ?? ($lecturerIds->count() === 1 ? $lecturerIds->first() : null)) : $user->id;
            if (! $lecturerId || ! $lecturerIds->contains((int) $lecturerId)) throw ValidationException::withMessages(['lecturer_id' => [__('basic_attendance.lecturer_assignment_required')]]);
            if (DB::table('basic_lecture_sessions')->where('section_id', $sectionId)->where('active_guard', 1)->exists()) {
                throw ValidationException::withMessages(['session' => [__('basic_attendance.message01')]]);
            }
            $studentIds = DB::table('basic_enrollments as e')->join('basic_students as st', 'st.id', '=', 'e.student_id')->where('e.section_id', $sectionId)->where('e.is_active', true)->where('st.is_active', true)->pluck('st.id');
            if ($studentIds->isEmpty()) throw ValidationException::withMessages(['roster' => [__('basic_attendance.message02')]]);
            $id = DB::table('basic_lecture_sessions')->insertGetId(['public_id' => (string) Str::uuid(), 'section_id' => $sectionId, 'created_by' => $user->id, 'lecturer_id' => $lecturerId, 'title' => $data['title'], 'mode' => $data['mode'], 'window_minutes' => $data['window_minutes'], 'late_after_minutes' => 0, 'state' => 'check_in', 'active_guard' => 1, 'version' => 1, 'opened_at' => now(), 'phase_expires_at' => now()->addMinutes($data['window_minutes']), 'auto_finalize_at' => now()->addHours(config('basic_attendance.auto_finalize_hours', 24)), 'created_at' => now(), 'updated_at' => now()]);
            foreach ($studentIds->chunk(500) as $chunk) DB::table('basic_lecture_records')->insert($chunk->map(fn ($student) => ['session_id' => $id, 'student_id' => $student, 'status' => 'pending', 'source' => 'qr', 'created_at' => now(), 'updated_at' => now()])->all());
            $this->audit($id, $user->id, 'session.opened', ['roster_count' => $studentIds->count(), 'lecturer_id' => $lecturerId]);
            return $id;
        });
    }

    /** Only roster students with a usable email challenge can delay finalization. */
    public function pendingScanStudents(int $sessionId): \Illuminate\Support\Collection
    {
        return DB::table('basic_scan_claims as claim')
            ->join('basic_lecture_records as record', function ($join) {
                $join->on('record.session_id', '=', 'claim.session_id')->on('record.student_id', '=', 'claim.student_id');
            })
            ->join('basic_students as student', 'student.id', '=', 'claim.student_id')
            ->join('basic_otp_challenges as otp', function ($join) {
                $join->on('otp.scan_claim_id', '=', 'claim.id')->on('otp.student_id', '=', 'claim.student_id');
            })
            ->where('claim.session_id', $sessionId)
            ->whereNull('claim.consumed_at')->where('claim.expires_at', '>', now())
            ->whereNull('otp.consumed_at')->where('otp.expires_at', '>', now())->where('otp.attempts', '<', 5)
            ->where('record.source', 'qr')
            ->where(function ($query) {
                $query->where(function ($entry) {
                    $entry->where('claim.phase', 'check_in')->whereNull('record.check_in_at');
                })->orWhere(function ($exit) {
                    $exit->where('claim.phase', 'check_out')->whereNotNull('record.check_in_at')->whereNull('record.check_out_at');
                });
            })
            ->select('claim.student_id', 'student.name', 'student.university_number')
            ->selectRaw('MAX(otp.expires_at) as pending_until')
            ->groupBy('claim.student_id', 'student.name', 'student.university_number')
            ->get();
    }

    /** Enrol new students in the current register without touching saved lectures. */
    public function syncActiveRoster(int $sectionId, array $studentIds, ?int $actorId): int
    {
        $session = DB::table('basic_lecture_sessions')->where('section_id', $sectionId)
            ->where('active_guard', 1)->whereNull('archived_at')->lockForUpdate()->first();
        if (! $session || $studentIds === [] || ($session->auto_finalize_at
            && ! Carbon::parse($session->auto_finalize_at)->isFuture())) return 0;
        $eligible = DB::table('basic_students')->whereIn('id', array_unique($studentIds))->where('is_active', true)->pluck('id');
        $existing = DB::table('basic_lecture_records')->where('session_id', $session->id)
            ->whereIn('student_id', $eligible)->pluck('student_id');
        $missing = $eligible->diff($existing)->values();
        foreach ($missing->chunk(500) as $chunk) {
            DB::table('basic_lecture_records')->insert($chunk->map(fn ($id) => [
                'session_id' => $session->id, 'student_id' => $id, 'status' => 'pending',
                'source' => 'qr', 'created_at' => now(), 'updated_at' => now(),
            ])->all());
        }
        if ($missing->isNotEmpty()) $this->audit($session->id, $actorId, 'roster.added_to_open_lecture', [
            'student_ids' => $missing->all(), 'count' => $missing->count(),
        ]);
        return $missing->count();
    }

    public function finalizeExpired(int $limit = 100): int
    {
        $ids = DB::table('basic_lecture_sessions')->where('active_guard', 1)
            ->whereNull('archived_at')->whereNotNull('auto_finalize_at')
            ->where('auto_finalize_at', '<=', now())->orderBy('auto_finalize_at')
            ->limit($limit)->pluck('id');
        $done = 0;
        foreach ($ids as $id) if ($this->autoFinalizeSession((int) $id)) $done++;
        return $done;
    }

    public function finalizeExpiredForSection(int $sectionId): int
    {
        $ids = DB::table('basic_lecture_sessions')->where('section_id', $sectionId)
            ->where('active_guard', 1)->whereNull('archived_at')
            ->whereNotNull('auto_finalize_at')->where('auto_finalize_at', '<=', now())->pluck('id');
        $done = 0;
        foreach ($ids as $id) if ($this->autoFinalizeSession((int) $id)) $done++;
        return $done;
    }

    public function autoFinalizeSession(int $id): bool
    {
        if (! DB::table('basic_lecture_sessions')->where('id', $id)->where('active_guard', 1)
            ->whereNotNull('auto_finalize_at')->where('auto_finalize_at', '<=', now())->exists()) return false;
        return DB::transaction(function () use ($id): bool {
            $session = DB::table('basic_lecture_sessions')->where('id', $id)->lockForUpdate()->first();
            if (! $session || ! $session->active_guard || $session->archived_at || ! $session->auto_finalize_at
                || Carbon::parse($session->auto_finalize_at)->isFuture()) return false;
            // A student who already scanned must have time to finish email verification.
            if ($this->pendingScanStudents($id)->isNotEmpty()) return false;
            $this->finalizeRecords($session, true);
            DB::table('basic_lecture_sessions')->where('id', $id)->update([
                'state' => 'finalized', 'active_guard' => null, 'phase_expires_at' => null,
                'finalized_at' => now(), 'version' => $session->version + 1, 'updated_at' => now(),
            ]);
            $this->audit($id, null, 'session.auto_finalized', [
                'previous_state' => $session->state, 'deadline' => $session->auto_finalize_at,
            ]);
            return true;
        });
    }

    private function finalizeRecords(object $session, bool $automatic = false): void
    {
        // A forgotten second-check phase must not turn students who checked in
        // into incomplete attendances merely because the lecturer left.
        $secondCheckOpened = ! $automatic || DB::table('basic_attendance_audits')
            ->where('session_id', $session->id)->where('event', 'session.open_exit')->exists();
        DB::table('basic_lecture_records')->where('session_id', $session->id)->where('source', 'qr')
            ->update(['status' => DB::raw($session->mode === 'double' && $secondCheckOpened
                ? "CASE WHEN check_in_at IS NULL THEN 'absent' WHEN check_out_at IS NULL THEN 'incomplete' ELSE 'present' END"
                : "CASE WHEN check_in_at IS NULL THEN 'absent' ELSE 'present' END"), 'updated_at' => now()]);
        DB::table('basic_scan_claims')->where('session_id', $session->id)->whereNull('consumed_at')
            ->update(['consumed_at' => now(), 'updated_at' => now()]);
    }

    public function transition(User $user, int $id, string $action, bool $overridePending = false, ?int $expectedPendingCount = null): void
    {
        $this->session($user, $id);
        DB::transaction(function () use ($user, $id, $action, $overridePending, $expectedPendingCount) {
            $s = DB::table('basic_lecture_sessions')->where('id', $id)->lockForUpdate()->first();
            if ($action !== 'finalize' && $s->auto_finalize_at && Carbon::parse($s->auto_finalize_at)->isPast()) {
                throw ValidationException::withMessages(['session' => ['انتهت مهلة المحاضرة. سيتم اعتماد كشفها تلقائيًا؛ حدّث الصفحة.']]);
            }
            $allowed = match ($action) {
                'close' => in_array($s->state, ['check_in', 'check_out']),
                'open_exit' => $s->state === 'paused' && $s->mode === 'double',
                'reopen_entry' => $s->state === 'paused' && ! DB::table('basic_lecture_records')->where('session_id', $id)->whereNotNull('check_out_at')->exists(),
                'finalize' => $s->state !== 'finalized', default => false,
            };
            abort_unless($allowed, 409);
            $pending = $action === 'finalize' ? $this->pendingScanStudents($id) : collect();
            if ($action === 'finalize' && $pending->isNotEmpty() && ! $overridePending) {
                throw ValidationException::withMessages(['pending_scans' => [__('basic_attendance.pending_scans_block_transition')]]);
            }
            if ($action === 'finalize' && $overridePending && $expectedPendingCount !== $pending->count()) {
                throw ValidationException::withMessages(['pending_scans' => [__('basic_attendance.pending_scans_changed')]]);
            }
            $state = match ($action) { 'close' => 'paused', 'open_exit' => 'check_out', 'reopen_entry' => 'check_in', 'finalize' => 'finalized' };
            $values = ['state' => $state, 'version' => $s->version + 1, 'phase_expires_at' => in_array($state, ['check_in', 'check_out']) ? now()->addMinutes($s->window_minutes) : null, 'updated_at' => now()];
            if ($action === 'finalize') {
                $values += ['active_guard' => null, 'finalized_at' => now()];
                $this->finalizeRecords($s);
            }
            DB::table('basic_lecture_sessions')->where('id', $id)->update($values);
            $this->audit($id, $user->id, 'session.'.$action, ['previous_state' => $s->state, 'state' => $state, 'pending_students' => $pending->count(), 'override_pending' => $action === 'finalize' && $pending->isNotEmpty() && $overridePending]);
        });
    }

    public function token(object $s): string
    {
        $payload = rtrim(strtr(base64_encode(json_encode([$s->public_id, $s->state, (int) $s->version, intdiv(now()->timestamp, 30)])), '+/', '-_'), '=');
        return $payload.'.'.hash_hmac('sha256', 'basic-lecture:'.$payload, (string) config('app.key'));
    }

    /** A valid, freshly displayed QR reserves its scan time before any email delay. */
    public function prepareClaim(object $expected, ?string $existingToken = null): array
    {
        return DB::transaction(function () use ($expected, $existingToken): array {
            $s = DB::table('basic_lecture_sessions')->where('id', $expected->id)->whereNull('archived_at')->lockForUpdate()->first();
            if (! $s || (int) $s->version !== (int) $expected->version || $s->state !== $expected->state || ! $this->accepting($s)) $this->invalidQr();
            if ($existingToken && strlen($existingToken) === 64) {
                $existing = DB::table('basic_scan_claims')->where('session_id', $s->id)->where('token_hash', hash('sha256', $existingToken))
                    ->where('version', $s->version)->where('phase', $s->state)->whereNull('consumed_at')->where('expires_at', '>', now())->first();
                if ($existing) return ['id' => $existing->id, 'token' => $existingToken, 'expires_at' => Carbon::parse($existing->expires_at)];
            }
            $token = Str::random(64);
            $scannedAt = now();
            $expiresAt = $scannedAt->copy()->addMinutes(self::SCAN_CLAIM_MINUTES);
            $id = DB::table('basic_scan_claims')->insertGetId([
                'session_id' => $s->id, 'token_hash' => hash('sha256', $token), 'phase' => $s->state,
                'version' => $s->version, 'scanned_at' => $scannedAt, 'expires_at' => $expiresAt,
                'created_at' => $scannedAt, 'updated_at' => $scannedAt,
            ]);
            return ['id' => $id, 'token' => $token, 'expires_at' => $expiresAt];
        });
    }

    /** Called inside OTP verification's transaction, after checking the browser-bound claim cookie. */
    public function confirmClaim(int $student, int $claimId): array
    {
        $reference = DB::table('basic_scan_claims')->find($claimId);
        if (! $reference) throw ValidationException::withMessages(['qr' => [__('basic_attendance.claim_expired')]]);
        $s = DB::table('basic_lecture_sessions')->where('id', $reference->session_id)->whereNull('archived_at')->lockForUpdate()->first();
        $claim = DB::table('basic_scan_claims')->where('id', $claimId)->lockForUpdate()->first();
        if (! $s || $s->state === 'finalized' || ! $claim || (int) $claim->student_id !== $student || $claim->consumed_at || now()->greaterThanOrEqualTo($claim->expires_at)) {
            throw ValidationException::withMessages(['qr' => [__('basic_attendance.claim_expired')]]);
        }
        $visible = DB::table('basic_sections as section')->join('basic_courses as course', 'course.id', '=', 'section.course_id')
            ->where('section.id', $s->section_id)->whereNull('section.archived_at')->whereNull('course.archived_at')->exists();
        if (! $visible) throw ValidationException::withMessages(['qr' => [__('basic_attendance.claim_expired')]]);
        $row = DB::table('basic_lecture_records')->where('session_id', $s->id)->where('student_id', $student)->lockForUpdate()->first();
        if (! $row) throw ValidationException::withMessages(['student' => [__('basic_attendance.message04')]]);
        if ($row->source === 'manual') throw ValidationException::withMessages(['student' => [__('basic_attendance.message05')]]);
        $field = $claim->phase === 'check_in' ? 'check_in_at' : 'check_out_at';
        if ($field === 'check_out_at' && ! $row->check_in_at) throw ValidationException::withMessages(['student' => [__('basic_attendance.message06')]]);
        $already = $row->$field !== null;
        $scannedAt = Carbon::parse($claim->scanned_at);
        if (! $already) {
            $values = [$field => $scannedAt, 'updated_at' => now()];
            DB::table('basic_lecture_records')->where('id', $row->id)->update($values);
            $this->audit($s->id, null, 'student.'.$claim->phase, ['student_id' => $student, 'claim_id' => $claim->id, 'scanned_at' => $claim->scanned_at, 'verified_at' => now()->toDateTimeString()]);
        }
        DB::table('basic_scan_claims')->where('id', $claimId)->update(['consumed_at' => now(), 'updated_at' => now()]);
        $section = DB::table('basic_sections as sec')->join('basic_courses as c', 'c.id', '=', 'sec.course_id')->where('sec.id', $s->section_id)->select('c.name', 'sec.number')->first();
        return ['phase' => $claim->phase, 'already_recorded' => $already, 'time' => $already ? Carbon::parse($row->$field)->toIso8601String() : $scannedAt->toIso8601String(), 'course_name' => $section->name, 'section_number' => $section->number, 'title' => $s->title];
    }

    public function validateToken(string $token): object
    {
        $parts = explode('.', $token);
        if (count($parts) !== 2 || ! hash_equals(hash_hmac('sha256', 'basic-lecture:'.$parts[0], (string) config('app.key')), $parts[1])) $this->invalidQr();
        $payload = json_decode(base64_decode(strtr($parts[0], '-_', '+/'), true) ?: '', true);
        if (! is_array($payload) || count($payload) !== 4 || ! is_int($payload[3])) $this->invalidQr();
        $age = now()->timestamp - $payload[3] * 30;
        if ($age < 0 || $age > 35) $this->invalidQr();
        $s = DB::table('basic_lecture_sessions as lecture')->join('basic_sections as section', 'section.id', '=', 'lecture.section_id')->join('basic_courses as course', 'course.id', '=', 'section.course_id')->where('lecture.public_id', $payload[0])->whereNull('lecture.archived_at')->whereNull('section.archived_at')->whereNull('course.archived_at')->select('lecture.*')->first();
        if (! $s || (int) $s->version !== $payload[2] || $s->state !== $payload[1] || ! $this->accepting($s)) $this->invalidQr();
        return $s;
    }

    public function accepting(object $s): bool
    {
        return in_array($s->state, ['check_in', 'check_out']) && $s->phase_expires_at
            && Carbon::parse($s->phase_expires_at)->isFuture()
            && (! $s->auto_finalize_at || Carbon::parse($s->auto_finalize_at)->isFuture());
    }

    private function invalidQr(): never
    {
        throw ValidationException::withMessages(['qr' => [__('basic_attendance.message03')]]);
    }

    public function identity(string $token): ?object
    {
        if (strlen($token) !== 80) return null;
        return DB::table('basic_trusted_devices as d')->join('basic_students as st', 'st.id', '=', 'd.student_id')
            ->where('d.token_hash', hash('sha256', $token))->whereNull('d.revoked_at')->where('d.expires_at', '>', now())->where('st.is_active', true)->select('st.id', 'st.name', 'st.university_number')->first();
    }

    /** Session row lock serializes transitions and scans; duplicates are idempotent. */
    public function scan(int $student, object $expected): array
    {
        return DB::transaction(function () use ($student, $expected) {
            $s = DB::table('basic_lecture_sessions')->where('id', $expected->id)->whereNull('archived_at')->lockForUpdate()->first();
            if (! $s || (int) $s->version !== (int) $expected->version || $s->state !== $expected->state || ! $this->accepting($s)) $this->invalidQr();
            $visible = DB::table('basic_sections as section')->join('basic_courses as course', 'course.id', '=', 'section.course_id')->where('section.id', $s->section_id)->whereNull('section.archived_at')->whereNull('course.archived_at')->exists();
            if (! $visible) $this->invalidQr();
            $row = DB::table('basic_lecture_records')->where('session_id', $s->id)->where('student_id', $student)->lockForUpdate()->first();
            if (! $row) throw ValidationException::withMessages(['student' => [__('basic_attendance.message04')]]);
            if ($row->source === 'manual') throw ValidationException::withMessages(['student' => [__('basic_attendance.message05')]]);
            $field = $s->state === 'check_in' ? 'check_in_at' : 'check_out_at';
            if ($field === 'check_out_at' && ! $row->check_in_at) throw ValidationException::withMessages(['student' => [__('basic_attendance.message06')]]);
            $already = $row->$field !== null;
            if (! $already) {
                $values = [$field => now(), 'updated_at' => now()];
                DB::table('basic_lecture_records')->where('id', $row->id)->update($values);
                $this->audit($s->id, null, 'student.'.$s->state, ['student_id' => $student]);
            }
            $section = DB::table('basic_sections as sec')->join('basic_courses as c', 'c.id', '=', 'sec.course_id')->where('sec.id', $s->section_id)->select('c.name', 'sec.number')->first();
            return ['phase' => $s->state, 'already_recorded' => $already, 'time' => $already ? Carbon::parse($row->$field)->toIso8601String() : now()->toIso8601String(), 'course_name' => $section->name, 'section_number' => $section->number, 'title' => $s->title];
        });
    }
}

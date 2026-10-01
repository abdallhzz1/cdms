<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\BasicAttendanceReportExport;
use App\Exports\BasicAttendanceMonthlyExport;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\User;
use App\Services\BasicAttendanceService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;

class BasicAttendanceController extends Controller
{
    public function __construct(private BasicAttendanceService $service) {}

    public function sections(Request $r)
    {
        $rows = $this->service->sections($r->user())->select('s.*', 'c.code as course_code', 'c.name as course_name', 'c.academic_level')->orderByDesc('s.id')->get();
        $ids = $rows->pluck('id');
        $counts = DB::table('basic_enrollments as e')->join('basic_students as st', 'st.id', '=', 'e.student_id')->whereIn('e.section_id', $ids)->where('e.is_active', true)->where('st.is_active', true)->selectRaw('e.section_id, COUNT(*) as total')->groupBy('e.section_id')->pluck('total', 'section_id');
        $lecturers = DB::table('basic_section_lecturers as l')->join('users as u', 'u.id', '=', 'l.user_id')->whereIn('l.section_id', $ids)->select('l.section_id', 'u.id', 'u.name')->get()->groupBy('section_id');
        $active = DB::table('basic_lecture_sessions')->whereIn('section_id', $ids)->whereNull('archived_at')->where('active_guard', 1)->get()->keyBy('section_id');
        foreach ($rows as $row) { $row->students_count = (int) ($counts[$row->id] ?? 0); $row->lecturers = $lecturers[$row->id] ?? []; $row->active_session = $active[$row->id] ?? null; }
        return ApiResponse::success($rows);
    }

    public function options()
    {
        return ApiResponse::success(['courses' => DB::table('basic_courses')->whereNull('archived_at')->orderBy('name')->get(), 'lecturers' => User::query()->where('is_active', true)->whereHas('roles', fn ($q) => $q->where('code', 'BASIC_LECTURER'))->orderBy('name')->get(['id', 'name', 'email'])]);
    }

    public function storeCourse(Request $r)
    {
        $data = $r->validate(['code' => ['required', 'string', 'max:40', 'unique:basic_courses,code'], 'name' => ['required', 'string', 'max:255'], 'academic_level' => ['required', 'in:first,second,third']]);
        $id = DB::table('basic_courses')->insertGetId($data + ['is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        $this->service->audit(null, $r->user()->id, 'course.created', ['course_id' => $id]);
        return ApiResponse::success(DB::table('basic_courses')->find($id), null, [], 201);
    }

    public function saveSection(Request $r, ?int $section = null)
    {
        if ($section) $this->service->section($r->user(), $section);
        $data = $r->validate(['course_id' => ['required', 'integer', \Illuminate\Validation\Rule::exists('basic_courses', 'id')->whereNull('archived_at')], 'number' => ['required', 'string', 'max:30'], 'academic_year' => ['required', 'string', 'max:30'], 'semester' => ['required', 'in:first,second,summer'], 'is_active' => ['sometimes', 'boolean'], 'lecturer_ids' => ['required', 'array', 'min:1', 'max:30'], 'lecturer_ids.*' => ['required', 'integer', 'distinct', 'exists:users,id']]);
        $eligible = User::whereIn('id', $data['lecturer_ids'])->where('is_active', true)->whereHas('roles', fn ($q) => $q->where('code', 'BASIC_LECTURER'))->count();
        if ($eligible !== count($data['lecturer_ids'])) throw ValidationException::withMessages(['lecturer_ids' => [__('basic_attendance.message07')]]);
        $duplicates = DB::table('basic_sections')->where('course_id', $data['course_id'])->where('number', $data['number'])->where('academic_year', $data['academic_year'])->where('semester', $data['semester'])->when($section, fn ($q) => $q->where('id', '!=', $section))->exists();
        if ($duplicates) throw ValidationException::withMessages(['number' => [__('basic_attendance.message08')]]);
        $id = DB::transaction(function () use ($section, $data, $r) {
            $ids = $data['lecturer_ids']; unset($data['lecturer_ids']);
            if ($section) {
                DB::table('basic_sections')->where('id', $section)->lockForUpdate()->first();
                $course = DB::table('basic_courses')->where('id', $data['course_id'])->lockForUpdate()->first();
                abort_unless($course && ! $course->archived_at, 409);
                // Preserve the meaning of existing historical sessions.
                $old = DB::table('basic_sections')->find($section);
                if (DB::table('basic_lecture_sessions')->where('section_id', $section)->exists()) {
                    foreach (['course_id', 'number', 'academic_year', 'semester'] as $field) if ((string) $data[$field] !== (string) $old->$field) throw ValidationException::withMessages([$field => [__('basic_attendance.message09')]]);
                }
                DB::table('basic_sections')->where('id', $section)->update($data + ['updated_at' => now()]); $id = $section;
            } else {
                $course = DB::table('basic_courses')->where('id', $data['course_id'])->lockForUpdate()->first();
                abort_unless($course && ! $course->archived_at, 409);
                $id = DB::table('basic_sections')->insertGetId($data + ['is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
            }
            DB::table('basic_section_lecturers')->where('section_id', $id)->delete();
            DB::table('basic_section_lecturers')->insert(array_map(fn ($user) => ['section_id' => $id, 'user_id' => $user], $ids));
            $this->service->audit(null, $r->user()->id, 'section.saved', ['section_id' => $id, 'lecturer_ids' => $ids]);
            return $id;
        });
        return ApiResponse::success($this->service->section($r->user(), $id));
    }

    public function roster(Request $r, int $section)
    {
        $this->service->section($r->user(), $section);
        return ApiResponse::success(DB::table('basic_enrollments as e')->join('basic_students as st', 'st.id', '=', 'e.student_id')->where('e.section_id', $section)->where('e.is_active', true)->select('st.id', 'st.name', 'st.university_number', 'st.email', 'st.photo_url')->orderBy('st.name')->get());
    }

    public function importRoster(Request $r, int $section)
    {
        $this->service->section($r->user(), $section);
        $data = $r->validate(['rows' => ['required', 'array', 'min:1', 'max:2000'], 'rows.*.university_number' => ['required', 'string', 'regex:/^[0-9]{6,20}$/', 'distinct'], 'rows.*.name' => ['required', 'string', 'max:255'], 'rows.*.email' => ['required', 'email', 'max:255', 'distinct:ignore_case'], 'rows.*.photo_url' => ['nullable', 'url:https', 'max:1000']]);
        DB::transaction(function () use ($data, $section, $r) {
            DB::table('basic_sections')->where('id', $section)->lockForUpdate()->first();
            foreach ($data['rows'] as $row) {
                $row['email'] = strtolower(trim($row['email']));
                if (DB::table('basic_students')->where('email', $row['email'])->where('university_number', '!=', $row['university_number'])->exists()) throw ValidationException::withMessages(['rows' => [__('basic_attendance.message10').$row['email'].__('basic_attendance.message11')]]);
                $student = DB::table('basic_students')->where('university_number', $row['university_number'])->first();
                if ($student) {
                    if ($student->email !== $row['email']) {
                        DB::table('basic_trusted_devices')->where('student_id', $student->id)->update(['revoked_at' => now()]);
                        DB::table('basic_otp_challenges')->where('student_id', $student->id)->update(['consumed_at' => now()]);
                    }
                    DB::table('basic_students')->where('id', $student->id)->update($row + ['updated_at' => now()]); $id = $student->id;
                } else $id = DB::table('basic_students')->insertGetId($row + ['is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
                $enrollment = DB::table('basic_enrollments')->where('section_id', $section)->where('student_id', $id)->first();
                if ($enrollment) DB::table('basic_enrollments')->where('id', $enrollment->id)->update(['is_active' => true, 'updated_at' => now()]);
                else DB::table('basic_enrollments')->insert(['section_id' => $section, 'student_id' => $id, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
            }
            $this->service->audit(null, $r->user()->id, 'roster.imported', ['section_id' => $section, 'count' => count($data['rows'])]);
        });
        return ApiResponse::success(['count' => count($data['rows'])], __('basic_attendance.message12'));
    }

    public function addRosterStudent(Request $r, int $section)
    {
        $this->service->section($r->user(), $section);
        $data = $r->validate([
            'university_number' => ['required', 'string', 'regex:/^[0-9]{6,20}$/'],
            'name' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
        ]);
        $data['name'] = trim($data['name'] ?? '');
        $data['email'] = strtolower(trim($data['email'] ?? ''));

        $result = DB::transaction(function () use ($data, $section, $r) {
            DB::table('basic_sections')->where('id', $section)->lockForUpdate()->first();
            $student = DB::table('basic_students')->where('university_number', $data['university_number'])->lockForUpdate()->first();
            if ($student) {
                if (! $student->is_active) throw ValidationException::withMessages(['university_number' => [__('basic_attendance.message41')]]);
                $studentId = $student->id;
            } else {
                if ($data['name'] === '') throw ValidationException::withMessages(['name' => [__('validation.required', ['attribute' => __('basic_attendance.message16')])]]);
                if ($data['email'] === '') throw ValidationException::withMessages(['email' => [__('validation.required', ['attribute' => __('basic_attendance.student_email')])]]);
                if (DB::table('basic_students')->where('email', $data['email'])->exists()) throw ValidationException::withMessages(['email' => [__('basic_attendance.message39')]]);
                $studentId = DB::table('basic_students')->insertGetId($data + ['is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
            }

            $enrollment = DB::table('basic_enrollments')->where('section_id', $section)->where('student_id', $studentId)->first();
            if ($enrollment?->is_active) throw ValidationException::withMessages(['university_number' => [__('basic_attendance.message40')]]);
            if ($enrollment) DB::table('basic_enrollments')->where('id', $enrollment->id)->update(['is_active' => true, 'updated_at' => now()]);
            else DB::table('basic_enrollments')->insert(['section_id' => $section, 'student_id' => $studentId, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

            $this->service->audit(null, $r->user()->id, 'enrollment.manual_added', ['section_id' => $section, 'student_id' => $studentId, 'existing_student' => (bool) $student]);
            return ['id' => $studentId, 'existing_student' => (bool) $student];
        });

        return ApiResponse::success($result, __('basic_attendance.message42'), [], 201);
    }

    public function removeEnrollment(Request $r, int $section, int $student)
    {
        $this->service->section($r->user(), $section);
        $changed = DB::table('basic_enrollments')->where('section_id', $section)->where('student_id', $student)->where('is_active', true)->update(['is_active' => false, 'updated_at' => now()]);
        abort_unless($changed, 404);
        $this->service->audit(null, $r->user()->id, 'enrollment.withdrawn', ['section_id' => $section, 'student_id' => $student]);
        return ApiResponse::success(null, __('basic_attendance.message13'));
    }

    public function archiveCourse(Request $r, int $course)
    {
        $data = $r->validate(['confirm' => ['required', 'string'], 'reason' => ['required', 'string', 'min:5', 'max:500']]);
        DB::transaction(function () use ($r, $course, $data) {
            $item = DB::table('basic_courses')->where('id', $course)->whereNull('archived_at')->lockForUpdate()->first();
            abort_unless($item, 404);
            if ($data['confirm'] !== $item->code) throw ValidationException::withMessages(['confirm' => [__('basic_attendance.archive_confirm_mismatch')]]);
            $active = DB::table('basic_lecture_sessions as lecture')->join('basic_sections as section', 'section.id', '=', 'lecture.section_id')->where('section.course_id', $course)->where('lecture.active_guard', 1)->whereNull('lecture.archived_at')->exists();
            if ($active) throw ValidationException::withMessages(['course' => [__('basic_attendance.archive_active_session')]]);
            DB::table('basic_courses')->where('id', $course)->update(['archived_at' => now(), 'updated_at' => now()]);
            $this->service->audit(null, $r->user()->id, 'course.archived', ['course_id' => $course, 'code' => $item->code, 'reason' => $data['reason']]);
        });
        return ApiResponse::success(null, __('basic_attendance.archive_done'));
    }

    public function archiveSection(Request $r, int $section)
    {
        $this->service->section($r->user(), $section);
        $data = $r->validate(['confirm' => ['required', 'string'], 'reason' => ['required', 'string', 'min:5', 'max:500']]);
        DB::transaction(function () use ($r, $section, $data) {
            $item = DB::table('basic_sections')->where('id', $section)->whereNull('archived_at')->lockForUpdate()->first();
            abort_unless($item, 404);
            if ($data['confirm'] !== $item->number) throw ValidationException::withMessages(['confirm' => [__('basic_attendance.archive_confirm_mismatch')]]);
            if (DB::table('basic_lecture_sessions')->where('section_id', $section)->where('active_guard', 1)->whereNull('archived_at')->exists()) throw ValidationException::withMessages(['section' => [__('basic_attendance.archive_active_session')]]);
            DB::table('basic_sections')->where('id', $section)->update(['archived_at' => now(), 'updated_at' => now()]);
            $this->service->audit(null, $r->user()->id, 'section.archived', ['section_id' => $section, 'number' => $item->number, 'reason' => $data['reason']]);
        });
        return ApiResponse::success(null, __('basic_attendance.archive_done'));
    }

    public function archiveSession(Request $r, int $session)
    {
        $this->service->session($r->user(), $session);
        $data = $r->validate(['confirm' => ['required', 'string'], 'reason' => ['required', 'string', 'min:5', 'max:500']]);
        DB::transaction(function () use ($r, $session, $data) {
            $item = DB::table('basic_lecture_sessions')->where('id', $session)->whereNull('archived_at')->lockForUpdate()->first();
            abort_unless($item, 404);
            if ($data['confirm'] !== $item->title) throw ValidationException::withMessages(['confirm' => [__('basic_attendance.archive_confirm_mismatch')]]);
            if ($item->active_guard) throw ValidationException::withMessages(['session' => [__('basic_attendance.archive_active_session')]]);
            DB::table('basic_lecture_sessions')->where('id', $session)->update(['archived_at' => now(), 'version' => $item->version + 1, 'updated_at' => now()]);
            $this->service->audit($session, $r->user()->id, 'session.archived', ['title' => $item->title, 'reason' => $data['reason']]);
        });
        return ApiResponse::success(null, __('basic_attendance.archive_done'));
    }

    public function sessions(Request $r, int $section)
    {
        $this->service->section($r->user(), $section);
        return ApiResponse::success(DB::table('basic_lecture_sessions')->where('section_id', $section)->whereNull('archived_at')->orderByDesc('id')->limit(100)->get()->map(fn ($s) => $this->service->dates($s)));
    }

    public function start(Request $r, int $section)
    {
        $data = $r->validate(['title' => ['required', 'string', 'max:150'], 'mode' => ['required', 'in:single,double'], 'window_minutes' => ['required', 'integer', 'min:1', 'max:30'], 'late_after_minutes' => ['required', 'integer', 'min:0', 'max:30'], 'lecturer_id' => ['nullable', 'integer', 'exists:users,id']]);
        return ApiResponse::success(['id' => $this->service->start($r->user(), $section, $data)], null, [], 201);
    }

    public function show(Request $r, int $session)
    {
        $s = $this->service->session($r->user(), $session);
        $rows = DB::table('basic_lecture_records as r')->join('basic_students as st', 'st.id', '=', 'r.student_id')->where('r.session_id', $session)->select('r.*', 'st.name', 'st.university_number', 'st.photo_url')->orderBy('st.name')->get();
        $this->service->dates($s); $rows->each(fn ($row) => $this->service->dates($row));
        return ApiResponse::success(['session' => $s, 'section' => $this->service->section($r->user(), $s->section_id), 'accepting' => $this->service->accepting($s), 'rows' => $rows, 'counts' => ['total' => $rows->count(), 'check_in' => $rows->whereNotNull('check_in_at')->count(), 'check_out' => $rows->whereNotNull('check_out_at')->count(), 'absent' => $rows->where('status', 'absent')->count(), 'incomplete' => $rows->where('status', 'incomplete')->count(), 'late' => $rows->where('is_late', true)->count()]]);
    }

    public function qr(Request $r, int $session)
    {
        $s = $this->service->session($r->user(), $session);
        if (! $this->service->accepting($s)) return ApiResponse::success(['url' => null, 'phase' => $s->state]);
        return ApiResponse::success(['url' => url('/lecture-attendance').'?qr='.rawurlencode($this->service->token($s)), 'phase' => $s->state, 'valid_until' => (intdiv(now()->timestamp, 15) + 1) * 15, 'server_time' => now()->timestamp]);
    }

    public function transition(Request $r, int $session)
    {
        $data = $r->validate(['action' => ['required', 'in:close,open_exit,reopen_entry,finalize']]);
        $this->service->transition($r->user(), $session, $data['action']);
        return $this->show($r, $session);
    }

    public function correct(Request $r, int $session, int $student)
    {
        $this->service->session($r->user(), $session);
        $data = $r->validate(['status' => ['required', 'in:present,absent,incomplete,excused'], 'is_late' => ['required', 'boolean'], 'reason' => ['required', 'string', 'min:5', 'max:1000']]);
        DB::transaction(function () use ($r, $session, $student, $data) {
            DB::table('basic_lecture_sessions')->where('id', $session)->lockForUpdate()->first();
            $row = DB::table('basic_lecture_records')->where('session_id', $session)->where('student_id', $student)->lockForUpdate()->first(); abort_unless($row, 404);
            DB::table('basic_lecture_records')->where('id', $row->id)->update($data + ['source' => 'manual', 'updated_at' => now()]);
            $this->service->audit($session, $r->user()->id, 'record.corrected', ['student_id' => $student, 'previous' => ['status' => $row->status, 'is_late' => $row->is_late], 'new' => $data]);
        });
        return ApiResponse::success(null, __('basic_attendance.message14'));
    }

    public function report(Request $r, int $section)
    {
        $this->service->section($r->user(), $section);
        $r->validate(['offset' => ['sometimes', 'integer', 'min:0', 'max:100000']]);
        $all = DB::table('basic_lecture_sessions')->where('section_id', $section)->whereNull('archived_at');
        $total = (clone $all)->count(); $offset = $r->integer('offset');
        $sessions = $all->orderByDesc('id')->offset($offset)->limit(7)->get()->reverse()->values();
        $records = DB::table('basic_lecture_records as r')->join('basic_students as st', 'st.id', '=', 'r.student_id')->whereIn('r.session_id', $sessions->pluck('id'))->select('r.*', 'st.name', 'st.university_number', 'st.photo_url')->get();
        $sessions->each(fn ($s) => $this->service->dates($s)); $records->each(fn ($row) => $this->service->dates($row));
        return ApiResponse::success(['section' => $this->service->section($r->user(), $section), 'sessions' => $sessions, 'students' => $records->unique('student_id')->map(fn ($st) => ['id' => $st->student_id, 'name' => $st->name, 'university_number' => $st->university_number, 'photo_url' => $st->photo_url])->sortBy('name')->values(), 'records' => $records, 'pagination' => ['offset' => $offset, 'total' => $total, 'per_page' => 7]]);
    }

    public function monthlySummary(Request $r, int $section)
    {
        $this->service->section($r->user(), $section);
        $data = $r->validate(['month' => ['nullable', 'date_format:Y-m']]);
        $month = $data['month'] ?? now()->format('Y-m');
        return ApiResponse::success($this->monthlySummaryData($section, $month));
    }

    public function monthlyOverview(Request $r)
    {
        $data = $r->validate(['month' => ['nullable', 'date_format:Y-m']]);
        $month = $data['month'] ?? now()->format('Y-m');
        $start = \Carbon\Carbon::createFromFormat('!Y-m', $month)->startOfMonth();
        $end = $start->copy()->addMonth();
        $sections = $this->service->sections($r->user())->select('s.id', 's.number', 's.academic_year', 's.course_id', 'c.code as course_code', 'c.name as course_name')->orderBy('c.name')->orderBy('s.number')->get();
        $ids = $sections->pluck('id');
        $assigned = DB::table('basic_section_lecturers as lecturer')->join('users as person', 'person.id', '=', 'lecturer.user_id')->whereIn('lecturer.section_id', $ids)->select('lecturer.section_id', 'person.id', 'person.name')->get()->groupBy('section_id');
        $counts = DB::table('basic_enrollments')->whereIn('section_id', $ids)->where('is_active', true)->selectRaw('section_id, COUNT(*) as total')->groupBy('section_id')->pluck('total', 'section_id');
        $lectures = DB::table('basic_lecture_sessions as lecture')->leftJoin('basic_lecture_records as record', 'record.session_id', '=', 'lecture.id')->leftJoin('users as lecturer', 'lecturer.id', '=', DB::raw('COALESCE(lecture.lecturer_id, lecture.created_by)'))
            ->whereIn('lecture.section_id', $ids)->whereNull('lecture.archived_at')->where('lecture.state', 'finalized')->where('lecture.opened_at', '>=', $start)->where('lecture.opened_at', '<', $end)
            ->selectRaw("lecture.section_id, COALESCE(lecture.lecturer_id, lecture.created_by) as lecturer_id, lecturer.name as lecturer_name, COUNT(DISTINCT lecture.id) as lectures, SUM(CASE WHEN record.status = 'present' THEN 1 ELSE 0 END) as present, SUM(CASE WHEN record.status = 'absent' THEN 1 ELSE 0 END) as absent, SUM(CASE WHEN record.status = 'excused' THEN 1 ELSE 0 END) as excused, SUM(CASE WHEN record.is_late = 1 THEN 1 ELSE 0 END) as late")
            ->groupBy('lecture.section_id', DB::raw('COALESCE(lecture.lecturer_id, lecture.created_by)'), 'lecturer.name')->get()->groupBy('section_id');
        $rows = $sections->map(function ($section) use ($assigned, $counts, $lectures) {
            $section->students_count = (int) ($counts[$section->id] ?? 0);
            $section->assigned_lecturers = ($assigned[$section->id] ?? collect())->map(fn ($person) => ['id' => $person->id, 'name' => $person->name])->values();
            $section->lecturers = ($lectures[$section->id] ?? collect())->map(function ($item) {
                foreach (['lectures', 'present', 'absent', 'excused', 'late'] as $field) $item->$field = (int) $item->$field;
                return $item;
            })->values();
            return $section;
        });
        return ApiResponse::success(['month' => $month, 'sections' => $rows]);
    }

    private function monthlySummaryData(int $section, string $month): array
    {
        $start = \Carbon\Carbon::createFromFormat('!Y-m', $month)->startOfMonth();
        $end = $start->copy()->addMonth();

        $sessions = DB::table('basic_lecture_sessions')->where('section_id', $section)->whereNull('archived_at')->where('state', 'finalized')
            ->where('opened_at', '>=', $start)->where('opened_at', '<', $end)->count();
        $monthly = DB::table('basic_lecture_records as r')->join('basic_lecture_sessions as s', 's.id', '=', 'r.session_id')
            ->where('s.section_id', $section)->whereNull('s.archived_at')->where('s.state', 'finalized')->where('s.opened_at', '>=', $start)->where('s.opened_at', '<', $end)
            ->selectRaw("r.student_id, COUNT(*) AS sessions, SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END) AS present, SUM(CASE WHEN r.status = 'absent' THEN 1 ELSE 0 END) AS absent, SUM(CASE WHEN r.status = 'excused' THEN 1 ELSE 0 END) AS excused, SUM(CASE WHEN r.status = 'incomplete' THEN 1 ELSE 0 END) AS incomplete, SUM(CASE WHEN r.is_late = 1 THEN 1 ELSE 0 END) AS late")
            ->groupBy('r.student_id')->get()->keyBy('student_id');
        $allAbsences = DB::table('basic_lecture_records as r')->join('basic_lecture_sessions as s', 's.id', '=', 'r.session_id')
            ->where('s.section_id', $section)->whereNull('s.archived_at')->where('s.state', 'finalized')->where('r.status', 'absent')
            ->selectRaw('r.student_id, COUNT(*) AS total')->groupBy('r.student_id')->pluck('total', 'student_id');
        $currentIds = DB::table('basic_enrollments')->where('section_id', $section)->where('is_active', true)->pluck('student_id');
        $historyIds = DB::table('basic_lecture_records as r')->join('basic_lecture_sessions as s', 's.id', '=', 'r.session_id')
            ->where('s.section_id', $section)->whereNull('s.archived_at')->distinct()->pluck('r.student_id');
        $studentIds = $currentIds->merge($historyIds)->unique()->values();
        $sent = DB::table('basic_absence_notifications')->where('section_id', $section)->whereIn('student_id', $studentIds)
            ->get(['student_id', 'threshold', 'sent_at'])->groupBy('student_id');
        $students = DB::table('basic_students')->whereIn('id', $studentIds)->orderBy('name')->get(['id', 'name', 'university_number', 'email', 'photo_url', 'is_active'])
            ->map(function ($student) use ($monthly, $allAbsences, $sent, $currentIds) {
                $row = $monthly[$student->id] ?? null;
                foreach (['sessions', 'present', 'absent', 'excused', 'incomplete', 'late'] as $field) $student->$field = (int) ($row->$field ?? 0);
                $student->total_absent = (int) ($allAbsences[$student->id] ?? 0);
                $student->is_enrolled = (bool) $student->is_active && $currentIds->contains($student->id);
                $student->notifications = ($sent[$student->id] ?? collect())->mapWithKeys(fn ($notice) => [(string) $notice->threshold => $notice->sent_at]);
                return $student;
            });
        return ['month' => $month, 'finalized_sessions' => $sessions, 'students' => $students];
    }

    public function sendAbsenceWarning(Request $r, int $section, int $student)
    {
        $sectionData = $this->service->section($r->user(), $section);
        $data = $r->validate(['threshold' => ['required', 'integer', 'in:4,6']]);
        $threshold = (int) $data['threshold'];

        DB::transaction(function () use ($section, $sectionData, $student, $threshold, $r) {
            $person = DB::table('basic_students')->where('id', $student)->lockForUpdate()->first();
            abort_unless($person && $person->is_active && DB::table('basic_enrollments')->where('section_id', $section)->where('student_id', $student)->where('is_active', true)->exists(), 404);
            if (! $person->email) throw ValidationException::withMessages(['student' => [__('basic_attendance.warning_missing_email')]]);
            $count = DB::table('basic_lecture_records as record')->join('basic_lecture_sessions as session', 'session.id', '=', 'record.session_id')
                ->where('session.section_id', $section)->whereNull('session.archived_at')->where('session.state', 'finalized')->where('record.student_id', $student)->where('record.status', 'absent')->count();
            if ($count < $threshold) throw ValidationException::withMessages(['student' => [__('basic_attendance.warning_not_eligible')]]);
            if (DB::table('basic_absence_notifications')->where('section_id', $section)->where('student_id', $student)->where('threshold', $threshold)->exists())
                throw ValidationException::withMessages(['student' => [__('basic_attendance.warning_already_sent')]]);
            $variables = ['student' => $person->name, 'course' => $sectionData->course_name, 'section' => $sectionData->number, 'count' => $count];
            try {
                Mail::raw(__('basic_attendance.warning_body_'.$threshold, $variables), fn ($mail) => $mail->to($person->email)->subject(__('basic_attendance.warning_subject_'.$threshold)));
            } catch (\Throwable $e) {
                report($e);
                throw ValidationException::withMessages(['email' => [__('basic_attendance.warning_send_failed')]]);
            }
            DB::table('basic_absence_notifications')->insert(['section_id' => $section, 'student_id' => $student, 'threshold' => $threshold, 'absence_count' => $count, 'sent_by' => $r->user()->id, 'sent_at' => now()]);
            $this->service->audit(null, $r->user()->id, 'absence.warning_sent', ['section_id' => $section, 'student_id' => $student, 'threshold' => $threshold, 'absence_count' => $count]);
        });
        return ApiResponse::success(null, __('basic_attendance.warning_sent'));
    }

    public function export(Request $r, int $section)
    {
        $sectionData = $this->service->section($r->user(), $section);
        $data = $r->validate(['month' => ['nullable', 'date_format:Y-m']]);
        $code = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string) $sectionData->course_code) ?: 'course';
        if (isset($data['month'])) {
            $summary = $this->monthlySummaryData($section, $data['month']);
            return Excel::download(
                new BasicAttendanceMonthlyExport($sectionData, $summary),
                'basic-attendance-'.$code.'-section-'.$section.'-'.$data['month'].'.xlsx',
                \Maatwebsite\Excel\Excel::XLSX,
            );
        }
        $rows = DB::table('basic_lecture_records as r')
            ->join('basic_students as st', 'st.id', '=', 'r.student_id')
            ->join('basic_lecture_sessions as s', 's.id', '=', 'r.session_id')
            ->where('s.section_id', $section)->whereNull('s.archived_at')
            ->select('st.university_number', 'st.name', 's.title', 's.opened_at', 's.state as session_state', 'r.status', 'r.check_in_at', 'r.check_out_at', 'r.is_late', 'r.source', 'r.reason')
            ->orderBy('st.university_number')->orderBy('s.opened_at')->orderBy('s.id')->orderBy('r.id');

        return Excel::download(
            new BasicAttendanceReportExport($sectionData, $rows, (clone $rows)->count()),
            'basic-attendance-'.$code.'-section-'.$section.'.xlsx',
            \Maatwebsite\Excel\Excel::XLSX,
        );
    }

    public function audit(Request $r, int $session)
    {
        $this->service->session($r->user(), $session);
        return ApiResponse::success(DB::table('basic_attendance_audits as a')->leftJoin('users as u', 'u.id', '=', 'a.user_id')->where('a.session_id', $session)->select('a.*', 'u.name as actor_name')->orderByDesc('a.id')->paginate(100));
    }
}

<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\User;
use App\Services\BasicAttendanceService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BasicAttendanceController extends Controller
{
    public function __construct(private BasicAttendanceService $service) {}

    public function sections(Request $r)
    {
        $rows = $this->service->sections($r->user())->select('s.*', 'c.code as course_code', 'c.name as course_name', 'c.academic_level')->orderByDesc('s.id')->get();
        $ids = $rows->pluck('id');
        $counts = DB::table('basic_enrollments as e')->join('basic_students as st', 'st.id', '=', 'e.student_id')->whereIn('e.section_id', $ids)->where('e.is_active', true)->where('st.is_active', true)->selectRaw('e.section_id, COUNT(*) as total')->groupBy('e.section_id')->pluck('total', 'section_id');
        $lecturers = DB::table('basic_section_lecturers as l')->join('users as u', 'u.id', '=', 'l.user_id')->whereIn('l.section_id', $ids)->select('l.section_id', 'u.id', 'u.name')->get()->groupBy('section_id');
        $active = DB::table('basic_lecture_sessions')->whereIn('section_id', $ids)->where('active_guard', 1)->get()->keyBy('section_id');
        foreach ($rows as $row) { $row->students_count = (int) ($counts[$row->id] ?? 0); $row->lecturers = $lecturers[$row->id] ?? []; $row->active_session = $active[$row->id] ?? null; }
        return ApiResponse::success($rows);
    }

    public function options()
    {
        return ApiResponse::success(['courses' => DB::table('basic_courses')->orderBy('name')->get(), 'lecturers' => User::query()->where('is_active', true)->whereHas('roles', fn ($q) => $q->where('code', 'BASIC_LECTURER'))->orderBy('name')->get(['id', 'name', 'email'])]);
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
        $data = $r->validate(['course_id' => ['required', 'integer', 'exists:basic_courses,id'], 'number' => ['required', 'string', 'max:30'], 'academic_year' => ['required', 'string', 'max:30'], 'semester' => ['required', 'in:first,second,summer'], 'is_active' => ['sometimes', 'boolean'], 'lecturer_ids' => ['required', 'array', 'min:1', 'max:30'], 'lecturer_ids.*' => ['required', 'integer', 'distinct', 'exists:users,id']]);
        $eligible = User::whereIn('id', $data['lecturer_ids'])->where('is_active', true)->whereHas('roles', fn ($q) => $q->where('code', 'BASIC_LECTURER'))->count();
        if ($eligible !== count($data['lecturer_ids'])) throw ValidationException::withMessages(['lecturer_ids' => [__('basic_attendance.message07')]]);
        $duplicates = DB::table('basic_sections')->where('course_id', $data['course_id'])->where('number', $data['number'])->where('academic_year', $data['academic_year'])->where('semester', $data['semester'])->when($section, fn ($q) => $q->where('id', '!=', $section))->exists();
        if ($duplicates) throw ValidationException::withMessages(['number' => [__('basic_attendance.message08')]]);
        $id = DB::transaction(function () use ($section, $data, $r) {
            $ids = $data['lecturer_ids']; unset($data['lecturer_ids']);
            if ($section) {
                DB::table('basic_sections')->where('id', $section)->lockForUpdate()->first();
                // Preserve the meaning of existing historical sessions.
                $old = DB::table('basic_sections')->find($section);
                if (DB::table('basic_lecture_sessions')->where('section_id', $section)->exists()) {
                    foreach (['course_id', 'number', 'academic_year', 'semester'] as $field) if ((string) $data[$field] !== (string) $old->$field) throw ValidationException::withMessages([$field => [__('basic_attendance.message09')]]);
                }
                DB::table('basic_sections')->where('id', $section)->update($data + ['updated_at' => now()]); $id = $section;
            } else $id = DB::table('basic_sections')->insertGetId($data + ['is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
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

    public function removeEnrollment(Request $r, int $section, int $student)
    {
        $this->service->section($r->user(), $section);
        DB::table('basic_enrollments')->where('section_id', $section)->where('student_id', $student)->update(['is_active' => false, 'updated_at' => now()]);
        $this->service->audit(null, $r->user()->id, 'enrollment.withdrawn', ['section_id' => $section, 'student_id' => $student]);
        return ApiResponse::success(null, __('basic_attendance.message13'));
    }

    public function sessions(Request $r, int $section)
    {
        $this->service->section($r->user(), $section);
        return ApiResponse::success(DB::table('basic_lecture_sessions')->where('section_id', $section)->orderByDesc('id')->limit(100)->get()->map(fn ($s) => $this->service->dates($s)));
    }

    public function start(Request $r, int $section)
    {
        $data = $r->validate(['title' => ['required', 'string', 'max:150'], 'mode' => ['required', 'in:single,double'], 'window_minutes' => ['required', 'integer', 'min:1', 'max:30'], 'late_after_minutes' => ['required', 'integer', 'min:0', 'max:30']]);
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
        $all = DB::table('basic_lecture_sessions')->where('section_id', $section);
        $total = (clone $all)->count(); $offset = $r->integer('offset');
        $sessions = $all->orderByDesc('id')->offset($offset)->limit(7)->get()->reverse()->values();
        $records = DB::table('basic_lecture_records as r')->join('basic_students as st', 'st.id', '=', 'r.student_id')->whereIn('r.session_id', $sessions->pluck('id'))->select('r.*', 'st.name', 'st.university_number', 'st.photo_url')->get();
        $sessions->each(fn ($s) => $this->service->dates($s)); $records->each(fn ($row) => $this->service->dates($row));
        return ApiResponse::success(['section' => $this->service->section($r->user(), $section), 'sessions' => $sessions, 'students' => $records->unique('student_id')->map(fn ($st) => ['id' => $st->student_id, 'name' => $st->name, 'university_number' => $st->university_number, 'photo_url' => $st->photo_url])->sortBy('name')->values(), 'records' => $records, 'pagination' => ['offset' => $offset, 'total' => $total, 'per_page' => 7]]);
    }

    public function export(Request $r, int $section)
    {
        $this->service->section($r->user(), $section);
        $rows = DB::table('basic_lecture_records as r')->join('basic_students as st', 'st.id', '=', 'r.student_id')->join('basic_lecture_sessions as s', 's.id', '=', 'r.session_id')->where('s.section_id', $section)->select('st.university_number', 'st.name', 's.title', 's.opened_at', 's.state', 'r.status', 'r.check_in_at', 'r.check_out_at', 'r.is_late', 'r.source', 'r.reason')->orderBy('s.id')->orderBy('st.name');
        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w'); fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, [__('basic_attendance.message15'), __('basic_attendance.message16'), __('basic_attendance.message17'), __('basic_attendance.message18'), __('basic_attendance.message19'), __('basic_attendance.message20'), __('basic_attendance.message21'), __('basic_attendance.message22'), __('basic_attendance.message23'), __('basic_attendance.message24'), __('basic_attendance.message25')], ',', '"', '');
            $rows->orderBy('r.id')->chunk(500, function ($chunk) use ($out) { foreach ($chunk as $row) fputcsv($out, array_map(fn ($v) => is_string($v) && preg_match('/^[=+\-@]/u', $v) ? "'".$v : $v, array_values((array) $row)), ',', '"', ''); }); fclose($out);
        }, 'lecture-attendance-'.$section.'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    public function audit(Request $r, int $session)
    {
        $this->service->session($r->user(), $session);
        return ApiResponse::success(DB::table('basic_attendance_audits as a')->leftJoin('users as u', 'u.id', '=', 'a.user_id')->where('a.session_id', $session)->select('a.*', 'u.name as actor_name')->orderByDesc('a.id')->paginate(100));
    }
}

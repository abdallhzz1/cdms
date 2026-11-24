<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AttendanceRecord;
use App\Models\AuditLog;
use App\Models\ClinicalUniversityAttendanceRecord;
use App\Models\ClinicalUniversityLecture;
use App\Models\ClinicalUniversitySession;
use App\Models\Person;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\User;
use App\Services\ClinicalAttendance\UniversityAttendanceRoster;
use App\Services\ClinicalAttendance\UniversityQrAttendanceService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Campus lectures have independent registers, projected into the student's active course attendance. */
class ClinicalUniversityAttendanceController extends Controller
{
    private const DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    public function __construct(private readonly \App\Services\ClinicalAttendance\UniversityLectureAccess $access) {}

    public function index(Request $request): JsonResponse
    {
        $actor = $request->user();
        $all = $this->access->canViewAny($actor);
        abort_unless($all || ($this->access->eligible($actor) && $actor->can('permission',['attendance.record'])),403);
        $ownPersonId = $all ? null : $this->access->person($actor)?->id;
        $request->validate(['student_group_id' => ['nullable', 'integer', 'exists:student_groups,id']]);
        $groups = StudentGroup::query()->with('academicYear:id,code,start_date,end_date,is_current')
            ->when(!$all,fn ($query)=>$query->whereIn('id',ClinicalUniversityLecture::where('supervisor_person_id',$ownPersonId??0)->select('student_group_id')))
            ->orderByDesc('academic_year_id')->orderBy('name')->get(['id', 'academic_year_id', 'academic_level', 'name']);
        $supervisorUsers = User::query()->where('is_active', true)
            ->whereHas('roles', fn ($roles) => $roles->whereIn('code', \App\Services\ClinicalAttendance\UniversityLectureAccess::INSTRUCTOR_ROLES))
            ->with('person')->orderBy('name')->get(['id', 'email','name']);
        $supervisors = Person::query()->where('is_active', true)
            ->where(fn ($query) => $query->whereIn('user_id', $supervisorUsers->pluck('id'))
                ->orWhere(fn ($unlinked) => $unlinked->whereNull('user_id')->whereIn('email', $supervisorUsers->pluck('email'))))
            ->orderBy('full_name_ar')->get(['id', 'user_id', 'email', 'full_name_ar', 'full_name_en']);
        $lecturers = $supervisorUsers->filter(fn ($user)=>!$user->person || $user->person->is_active)->map(function ($user) use ($supervisors) {
            $person=$user->person ?? $supervisors->first(fn ($person)=>strtolower((string)$person->email)===strtolower($user->email));
            return ['id'=>$person?->id,'user_id'=>$user->id,'full_name_ar'=>$person?->full_name_ar?:$user->name,'full_name_en'=>$person?->full_name_en];
        })->values();
        $lectures = ClinicalUniversityLecture::query()->with(['group.academicYear:id,code', 'supervisor:id,full_name_ar,full_name_en', 'sessions:id,clinical_university_lecture_id,session_date,qr_state,approved_at'])
            ->when(!$all,fn ($query)=>$query->where('supervisor_person_id',$ownPersonId??0))
            ->when($request->filled('student_group_id'),fn ($query)=>$query->where('student_group_id',$request->integer('student_group_id')))
            ->withCount('sessions')
            ->orderByDesc('is_active')->orderByDesc('starts_on')->orderBy('weekday')->orderBy('starts_at')->get();
        $sessions = ClinicalUniversitySession::query()->with(['lecture.group:id,name', 'supervisor:id,full_name_ar'])
            ->when(!$all,fn ($query)=>$query->whereHas('lecture',fn ($lecture)=>$lecture->where('supervisor_person_id',$ownPersonId??0)))
            ->when($request->filled('student_group_id'), fn ($query) => $query->whereHas('lecture', fn ($lecture) => $lecture->where('student_group_id', $request->integer('student_group_id'))))
            ->withCount('records')->orderByDesc('session_date')->orderByDesc('id')->limit(250)->get();

        $lectures = $lectures->map(fn (ClinicalUniversityLecture $lecture) => $this->planPayload($lecture));
        $sessions = $sessions->map(fn (ClinicalUniversitySession $session) => [
            ...$session->toArray(), 'session_date' => $session->session_date->toDateString(),
        ]);
        return ApiResponse::success(compact('groups', 'supervisors', 'lecturers', 'lectures', 'sessions'));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeManager($request);
        $data = $this->validateLecture($request);
        $lecture = DB::transaction(function () use ($request, $data) {
            $data = $this->resolveLecturer($data);
            StudentGroup::query()->whereKey($data['student_group_id'])->lockForUpdate()->firstOrFail();
            $this->validatePlan($data);
            $lecture = ClinicalUniversityLecture::create($data + ['created_by_user_id' => $request->user()->id]);
            $this->audit($request, 'clinical_university.lecture_created', $lecture->id, ['plan' => $lecture->only(array_keys($data))]);
            return $lecture;
        });
        return ApiResponse::success($lecture->load(['group.academicYear', 'supervisor']), 'تم إعداد محاضرة الجامعة للمجموعة الرئيسية.', [], 201);
    }

    public function update(Request $request, ClinicalUniversityLecture $lecture): JsonResponse
    {
        $this->authorizeManager($request);
        $data = $this->validateLecture($request);
        $lecture = DB::transaction(function () use ($request, $lecture, $data) {
            $data = $this->resolveLecturer($data);
            StudentGroup::query()->whereKey($data['student_group_id'])->lockForUpdate()->firstOrFail();
            $locked = ClinicalUniversityLecture::query()->whereKey($lecture->id)->lockForUpdate()->firstOrFail();
            abort_if($locked->sessions()->exists(), 409, 'هذه المحاضرة لها كشوف محفوظة. أوقفها وأنشئ موعدًا جديدًا لحفظ السجل التاريخي.');
            $this->validatePlan($data, $locked->id);
            $before = $locked->only(array_keys($data));
            $locked->update($data);
            $this->audit($request, 'clinical_university.lecture_updated', $locked->id, ['before' => $before, 'after' => $data]);
            return $locked;
        });
        return ApiResponse::success($lecture->load(['group.academicYear', 'supervisor']));
    }

    public function archive(Request $request, ClinicalUniversityLecture $lecture): JsonResponse
    {
        $this->authorizeManager($request);
        $lecture = DB::transaction(function () use ($request, $lecture) {
            $locked = ClinicalUniversityLecture::query()->whereKey($lecture->id)->lockForUpdate()->firstOrFail();
            abort_if($locked->sessions()->where('qr_state', 'open')->exists(), 409, 'أغلق QR المفتوح قبل إيقاف المحاضرة.');
            if ($locked->is_active) {
                $locked->update(['is_active' => false]);
                $this->audit($request, 'clinical_university.lecture_archived', $locked->id, []);
            }
            return $locked;
        });
        return ApiResponse::success($lecture, 'تم إيقاف المواعيد القادمة مع إبقاء كشوف الحضور السابقة.');
    }

    public function destroy(Request $request, ClinicalUniversityLecture $lecture): JsonResponse
    {
        $this->authorizeManager($request);
        $result = DB::transaction(function () use ($request, $lecture): string {
            $locked = ClinicalUniversityLecture::query()->whereKey($lecture->id)->lockForUpdate()->firstOrFail();
            abort_if($locked->sessions()->where('qr_state', 'open')->exists(), 409, 'أغلق QR المفتوح قبل حذف المحاضرة.');
            if ($locked->sessions()->exists()) {
                if ($locked->is_active) $locked->update(['is_active' => false]);
                $this->audit($request, 'clinical_university.lecture_archived', $locked->id, ['reason' => 'delete_requested_with_attendance']);
                return 'archived';
            }
            $this->audit($request, 'clinical_university.lecture_deleted', $locked->id, ['plan' => $locked->toArray()]);
            $locked->delete();
            return 'deleted';
        });
        return ApiResponse::success(['result' => $result], $result === 'deleted'
            ? 'حُذفت المحاضرة التي لا تملك كشف حضور.'
            : 'أُوقفت المحاضرة مع إبقاء كشف الحضور محفوظًا للتدقيق.');
    }

    public function destroyWithAttendance(Request $request, ClinicalUniversityLecture $lecture): JsonResponse
    {
        // This exceptional operation is reserved for administrative assistants,
        // even if another role is accidentally granted the matrix permission.
        abort_unless($request->user()?->hasRole('ADMIN_ASSISTANT')
            && $request->user()->can('permission', ['university_lectures.delete_with_attendance']), 403);
        $this->authorizeManager($request);
        $data = $request->validate([
            'confirmation' => ['required', 'string', Rule::in([$lecture->title])],
            'reason' => ['required', 'string', 'min:10', 'max:1000'],
        ]);
        $data['reason'] = trim($data['reason']);
        if (mb_strlen($data['reason']) < 10) {
            throw ValidationException::withMessages(['reason' => ['اكتب سببًا واضحًا للحذف لا يقل عن 10 أحرف.']]);
        }

        $result = DB::transaction(function () use ($request, $lecture, $data): array {
            $locked = ClinicalUniversityLecture::query()->whereKey($lecture->id)->lockForUpdate()->firstOrFail();
            abort_unless($data['confirmation'] === $locked->title, 409);
            $sessions = $locked->sessions()->lockForUpdate()->get();
            if ($sessions->contains(fn (ClinicalUniversitySession $session) => $session->qr_state === 'open')) {
                throw ValidationException::withMessages(['lecture' => ['أغلق QR المفتوح قبل حذف المحاضرة وكشفها.']]);
            }

            $sessionIds = $sessions->pluck('id')->all();
            $recordsDeleted = $sessionIds ? ClinicalUniversityAttendanceRecord::query()
                ->whereIn('clinical_university_session_id', $sessionIds)->delete() : 0;
            if ($sessionIds) ClinicalUniversitySession::query()->whereIn('id', $sessionIds)->delete();

            $this->audit($request, 'clinical_university.lecture_deleted_with_attendance', $locked->id, [
                'plan' => $locked->toArray(),
                'reason' => $data['reason'],
                'sessions_deleted' => count($sessionIds),
                'records_deleted' => $recordsDeleted,
            ]);
            $locked->delete();

            return ['result' => 'deleted_with_attendance', 'sessions_deleted' => count($sessionIds),
                'records_deleted' => $recordsDeleted];
        });

        return ApiResponse::success($result, 'حُذفت المحاضرة وكشوف حضورها نهائيًا من سجلات الحضور.');
    }

    public function mine(Request $request): JsonResponse
    {
        abort_unless($this->access->eligible($request->user()),403);
        $person = $this->access->person($request->user());
        if (!$person) return ApiResponse::success([]);
        $lectures = ClinicalUniversityLecture::query()->where('supervisor_person_id', $person->id)->where('is_active', true)
            ->with(['group.academicYear:id,code', 'supervisor:id,full_name_ar,full_name_en', 'sessions:id,clinical_university_lecture_id,session_date,qr_state,approved_at'])
            ->orderBy('weekday')->orderBy('starts_at')->get();
        return ApiResponse::success($lectures->map(fn (ClinicalUniversityLecture $lecture) => $this->planPayload($lecture)));
    }

    public function day(Request $request, ClinicalUniversityLecture $lecture): JsonResponse
    {
        $date = $request->validate(['session_date' => ['required', 'date_format:Y-m-d']])['session_date'];
        $this->authorizeLecture($request, $lecture);
        $this->validateOccurrence($lecture, $date, false);
        $session = $lecture->sessions()->whereDate('session_date', $date)->first();
        $rows = $session
            ? $session->records()->with(['student:id,university_number,full_name_ar,full_name_en,photo_url', 'subgroup:id,name', 'recorder:id,name'])
                ->get()->map(fn ($record) => [
                    'student' => $record->student, 'subgroup' => $record->subgroup,
                    'status' => $record->status, 'excuse_note' => $record->excuse_note,
                    'recorded_by' => $record->recorder?->name, 'updated_at' => $record->updated_at,
                ])
            : $this->roster($lecture, $date)->map(fn ($membership) => [
                'student' => $membership->student, 'subgroup' => $membership->subgroup,
                'status' => null, 'excuse_note' => null, 'recorded_by' => null, 'updated_at' => null,
            ]);
        $approved=$session?->isApproved()??false;
        $canCorrect=$this->access->canCorrectApproved($request->user());
        $canEdit=($approved?$canCorrect:($lecture->is_active&&$this->access->canOperate($request->user(),$lecture)))
            && $date<=today()->toDateString() && $session?->qr_state!=='open';
        return ApiResponse::success(['session_id' => $session?->id, 'qr_state' => $session?->qr_state,
            'is_approved'=>$approved,'approved_at'=>$session?->approved_at?->toIso8601String(),
            'can_edit'=>$canEdit,'can_correct_approved'=>$approved&&$canCorrect,
            'lecture' => $this->planPayload($lecture->loadMissing('group.academicYear')),
            'rows' => $rows->sortBy(fn ($row) => ($row['subgroup']?->name ?? '').'|'.($row['student']?->full_name_ar ?? ''))->values()]);
    }

    public function record(Request $request, ClinicalUniversityLecture $lecture): JsonResponse
    {
        $this->access->authorizeView($request->user(),$lecture);
        $person = $lecture->supervisor;
        $data = $request->validate([
            'session_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'records' => ['required', 'array', 'min:1', 'max:500'],
            'records.*.student_id' => ['required', 'integer', 'distinct', 'exists:students,id'],
            'records.*.status' => ['required', Rule::in(AttendanceRecord::STATUSES)],
            'records.*.excuse_note' => ['nullable', 'string', 'max:2000'],
            'correction_reason'=>['nullable','string','max:1000'],
        ]);
        foreach ($data['records'] as $index => $row) {
            if ($row['status'] === 'excused' && ! filled(trim((string) ($row['excuse_note'] ?? '')))) {
                throw ValidationException::withMessages(["records.$index.excuse_note" => ['سبب العذر مطلوب عند اختيار «بعذر».']]);
            }
        }
        $session = DB::transaction(function () use ($request, $lecture, $person, $data) {
            $locked = ClinicalUniversityLecture::query()->whereKey($lecture->id)->lockForUpdate()->firstOrFail();
            $session = $locked->sessions()->whereDate('session_date', $data['session_date'])->lockForUpdate()->first();
            $approved=$session?->isApproved()??false;
            if($approved) {
                abort_unless($this->access->canCorrectApproved($request->user()),403);
                if(mb_strlen(trim((string)($data['correction_reason']??'')))<10) {
                    throw ValidationException::withMessages(['correction_reason'=>[app()->getLocale()==='ar'?'اكتب سبب التصحيح بما لا يقل عن 10 أحرف.':'Enter a correction reason of at least 10 characters.']]);
                }
            } else $this->access->authorizeOperate($request->user(),$locked);
            $this->validateOccurrence($locked, $data['session_date'], !$approved);
            abort_if($session?->qr_state === 'open', 409, 'كشف QR مفتوح. أغلقه قبل إجراء تصحيح يدوي.');
            $existing = $session ? $session->records()->lockForUpdate()->get()->keyBy('student_id') : collect();
            $membership = $session ? collect() : $this->roster($locked, $data['session_date'])->keyBy('student_id');
            $allowed = ($session ? $existing->keys() : $membership->keys())->map(fn ($id) => (int) $id)->sort()->values()->all();
            $submitted = collect($data['records'])->pluck('student_id')->map(fn ($id) => (int) $id)->sort()->values()->all();
            if ($allowed !== $submitted) {
                throw ValidationException::withMessages(['records' => ['يجب تحديد حالة لكل طالب في المجموعة الرئيسية مرة واحدة، بما يشمل جميع المجموعات الفرعية. حدّث الكشف وأعد المحاولة.']]);
            }
            if (! $session) {
                $session = ClinicalUniversitySession::create([
                    'clinical_university_lecture_id' => $locked->id,
                    'session_date' => $data['session_date'],
                    'supervisor_person_id' => $person->id,
                    'recorded_by_user_id' => $request->user()->id,
                ]);
            }
            foreach ($data['records'] as $row) {
                $studentId = (int) $row['student_id'];
                $previous = $existing->get($studentId);
                $note = trim((string) ($row['excuse_note'] ?? '')) ?: null;
                if($previous && $previous->status===$row['status'] && $previous->excuse_note===$note) continue;
                $record = ClinicalUniversityAttendanceRecord::updateOrCreate(
                    ['clinical_university_session_id' => $session->id, 'student_id' => $studentId],
                    ['student_subgroup_id' => $previous?->student_subgroup_id ?? $membership->get($studentId)?->student_subgroup_id,
                        'status' => $row['status'], 'excuse_note' => $note, 'recorded_by_user_id' => $request->user()->id],
                );
                if (! $previous || $previous->status !== $row['status'] || $previous->excuse_note !== $note) {
                    $this->audit($request, 'clinical_university.attendance_recorded', $record->id, [
                        'lecture_id' => $locked->id, 'session_id' => $session->id, 'date' => $data['session_date'],
                        'student_id' => $studentId, 'previous_status' => $previous?->status, 'status' => $row['status'],
                        'previous_note' => $previous?->excuse_note, 'note' => $note,
                        'correction_reason'=>$approved?trim($data['correction_reason']):null,
                    ], $studentId);
                }
            }
            if(!$approved) {
                $session->update(['approved_at'=>now(),'approved_by_user_id'=>$request->user()->id]);
                AuditLog::create(['user_id'=>$request->user()->id,'action'=>'clinical_university.attendance_approved',
                    'entity_type'=>ClinicalUniversitySession::class,'entity_id'=>$session->id,
                    'changes'=>['lecture_id'=>$locked->id,'session_date'=>$data['session_date'],'source'=>'manual','records_count'=>count($data['records'])]]);
            }
            return $session;
        });
        return ApiResponse::success(['session_id' => $session->id,'is_approved'=>true], app()->getLocale()==='ar'?'تم اعتماد كشف الحضور.':'Attendance register approved.');
    }

    public function openQr(Request $request, ClinicalUniversityLecture $lecture, UniversityQrAttendanceService $qr): JsonResponse
    {
        $this->access->authorizeOperate($request->user(),$lecture);
        $person = $lecture->supervisor;
        $date = $request->validate(['session_date' => ['required', 'date_format:Y-m-d']])['session_date'];
        $session = $qr->open($lecture, $person, $request->user(), $date);
        return ApiResponse::success(['session_id' => $session->id, 'qr_state' => $session->qr_state], 'فُتح QR لمحاضرة الجامعة.');
    }

    public function qr(Request $request, ClinicalUniversityLecture $lecture, UniversityQrAttendanceService $qr): JsonResponse
    {
        $this->access->authorizeOperate($request->user(),$lecture);
        $date = $request->validate(['session_date' => ['required', 'date_format:Y-m-d']])['session_date'];
        $session = $lecture->sessions()->whereDate('session_date', $date)->firstOrFail();
        return ApiResponse::success($qr->payload($session));
    }

    public function closeQr(Request $request, ClinicalUniversityLecture $lecture, UniversityQrAttendanceService $qr): JsonResponse
    {
        $this->access->authorizeOperate($request->user(),$lecture);
        $person = $lecture->supervisor;
        $date = $request->validate(['session_date' => ['required', 'date_format:Y-m-d']])['session_date'];
        $session = $qr->close($lecture, $person, $request->user(), $date);
        return ApiResponse::success(['session_id' => $session->id, 'qr_state' => $session->qr_state], 'أُغلق QR وسُجل غير الماسحين غائبين.');
    }

    private function validateLecture(Request $request): array
    {
        $data = $request->validate([
            'student_group_id' => ['required', 'integer', 'exists:student_groups,id'],
            'supervisor_person_id' => ['required_without:lecturer_user_id',Rule::prohibitedIf($request->filled('lecturer_user_id')), 'integer', 'exists:people,id'],
            'lecturer_user_id' => ['required_without:supervisor_person_id',Rule::prohibitedIf($request->filled('supervisor_person_id')),'integer','exists:users,id'],
            'title' => ['required', 'string', 'max:160'],
            'weekday' => ['required', Rule::in(self::DAYS)],
            'starts_at' => ['required', 'date_format:H:i'],
            'ends_at' => ['required', 'date_format:H:i', 'after:starts_at'],
            'starts_on' => ['required', 'date_format:Y-m-d'],
            'ends_on' => ['required', 'date_format:Y-m-d', 'after_or_equal:starts_on'],
        ]);
        $data['title'] = trim($data['title']);
        if ($data['title'] === '') throw ValidationException::withMessages(['title' => ['اسم المحاضرة مطلوب.']]);
        $data['starts_at'] .= ':00';
        $data['ends_at'] .= ':00';
        return $data;
    }

    private function validatePlan(array $data, ?int $exceptId = null): void
    {
        $group = StudentGroup::with('academicYear')->findOrFail($data['student_group_id']);
        $supervisor = Person::findOrFail($data['supervisor_person_id']);
        $account = $supervisor->user ?? User::query()->where('email', $supervisor->email)->first();
        if (! $supervisor->is_active || !$account || !$this->access->eligible($account)) {
            throw ValidationException::withMessages(['supervisor_person_id' => ['اختر محاضرًا نشطًا من المشرفين السريريين أو مساعدي البحث والتدريس.']]);
        }
        if ($data['starts_on'] < $group->academicYear->start_date->toDateString() || $data['ends_on'] > $group->academicYear->end_date->toDateString()
            || Carbon::parse($data['starts_on'])->diffInDays($data['ends_on']) > 370) {
            throw ValidationException::withMessages(['starts_on' => ['مدة المحاضرة يجب أن تقع ضمن العام الأكاديمي للمجموعة.']]);
        }
        $overlapping = ClinicalUniversityLecture::query()->where('student_group_id', $group->id)->where('is_active', true)
            ->whereDate('starts_on', '<=', $data['ends_on'])->whereDate('ends_on', '>=', $data['starts_on'])
            ->when($exceptId, fn ($query) => $query->where('id', '!=', $exceptId))->get();
        for ($date = Carbon::parse($data['starts_on']); $date->lte(Carbon::parse($data['ends_on'])); $date->addDay()) {
            if (strtolower($date->format('l')) !== $data['weekday']) continue;
            $day = $date->toDateString();
            $sameDay = $overlapping->filter(fn (ClinicalUniversityLecture $lecture) => $lecture->weekday === $data['weekday']
                && $lecture->starts_on->toDateString() <= $day && $lecture->ends_on->toDateString() >= $day);
            if ($sameDay->contains(fn (ClinicalUniversityLecture $lecture) => $lecture->starts_at < $data['ends_at'] && $lecture->ends_at > $data['starts_at'])) {
                throw ValidationException::withMessages(['starts_at' => ['يوجد موعد متداخل للمجموعة في هذا اليوم.']]);
            }
        }
    }

    private function roster(ClinicalUniversityLecture $lecture, string $date)
    {
        return app(UniversityAttendanceRoster::class)->members($lecture, $date);
    }

    private function planPayload(ClinicalUniversityLecture $lecture): array
    {
        $lecture->loadMissing('group.academicYear', 'supervisor', 'sessions:id,clinical_university_lecture_id,session_date,qr_state,approved_at');
        $dates=$lecture->scheduledDates();
        $approvedDates=$lecture->sessions->filter(fn (ClinicalUniversitySession $session)=>$session->isApproved())->map(fn ($session)=>$session->session_date->toDateString())->all();
        $payload=$lecture->toArray();
        unset($payload['sessions']);
        return [...$payload, 'can_record_attendance'=>$this->access->canOperate(auth()->user(),$lecture), 'starts_on' => $lecture->starts_on->toDateString(),
            'ends_on' => $lecture->ends_on->toDateString(), 'scheduled_dates' => $dates,
            'available_qr_dates'=>array_values(array_diff($dates,$approvedDates))];
    }

    private function validateOccurrence(ClinicalUniversityLecture $lecture, string $date, bool $write): void
    {
        $day = Carbon::parse($date);
        if ($day->lt($lecture->starts_on) || $day->gt($lecture->ends_on) || strtolower($day->format('l')) !== $lecture->weekday
            || ($write && ! $lecture->is_active)) {
            throw ValidationException::withMessages(['session_date' => ['هذا التاريخ ليس موعدًا معتمدًا لهذه المحاضرة.']]);
        }
    }

    private function authorizeManager(Request $request): void
    {
        abort_unless($request->user()?->can('permission', ['university_lectures.manage']), 403);
    }

    private function authorizeLecture(Request $request, ClinicalUniversityLecture $lecture): void
    {
        $this->access->authorizeView($request->user(),$lecture);
    }

    private function resolveLecturer(array $data): array
    {
        if (isset($data['lecturer_user_id'])) {
            $user=User::whereKey($data['lecturer_user_id'])->lockForUpdate()->firstOrFail();
            if (!$this->access->eligible($user)) throw ValidationException::withMessages(['lecturer_user_id'=>['الحساب ليس لمحاضر نشط من المشرفين أو مساعدي البحث والتدريس.']]);
            $person=Person::where('user_id',$user->id)->first() ?? Person::whereNull('user_id')->whereRaw('LOWER(email) = ?',[strtolower($user->email)])->first();
            if (!$person) $person=Person::create(['user_id'=>$user->id,'email'=>strtolower($user->email),'full_name_ar'=>$user->name,'is_active'=>true]);
            elseif (!$person->user_id) $person->update(['user_id'=>$user->id]);
            $data['supervisor_person_id']=$person->id;
            unset($data['lecturer_user_id']);
        }
        return $data;
    }

    private function audit(Request $request, string $action, int $id, array $changes, ?int $studentId = null): void
    {
        AuditLog::create(['user_id' => $request->user()->id, 'action' => $action,
            'entity_type' => $action === 'clinical_university.attendance_recorded' ? ClinicalUniversityAttendanceRecord::class : ClinicalUniversityLecture::class,
            'entity_id' => $id,
            'student_id' => $studentId, 'changes' => $changes]);
    }
}

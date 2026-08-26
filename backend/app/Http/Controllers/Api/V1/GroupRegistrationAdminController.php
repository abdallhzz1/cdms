<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AuditLog;
use App\Models\GroupRegistrationCycle;
use App\Models\Student;
use App\Models\StudentGroup;
use App\Models\StudentGroupRoster;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class GroupRegistrationAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $cycles = GroupRegistrationCycle::query()
            ->with('academicYear')
            ->withCount('rosters')
            ->when($request->integer('academic_year_id'), fn ($q, $id) => $q->where('academic_year_id', $id))
            ->orderByDesc('id')->get();

        $data = $cycles->map(fn ($cycle) => $this->cycleData($cycle));
        return ApiResponse::success($data);
    }

    public function show(GroupRegistrationCycle $cycle): JsonResponse
    {
        return ApiResponse::success($this->cycleData($cycle->load('academicYear')));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'academic_year_id' => ['required', 'exists:academic_years,id'],
            'academic_level' => ['required', 'in:fourth,fifth,sixth'],
            'default_capacity' => ['required', 'integer', 'in:5,6'],
            'letters' => ['nullable', 'array', 'size:3'],
            'letters.*' => ['required', 'string', 'max:2', 'distinct'],
        ]);
        $defaults = ['fourth' => ['L','M','N'], 'fifth' => ['A','B','C'], 'sixth' => ['Q','R','S']];
        $letters = array_map(fn ($v) => strtoupper(trim($v)), $data['letters'] ?? $defaults[$data['academic_level']]);

        $cycle = DB::transaction(function () use ($data, $letters, $request) {
            $cycle = GroupRegistrationCycle::create([
                ...$data, 'letters' => null, 'public_id' => (string) Str::uuid(), 'status' => 'draft', 'created_by' => $request->user()->id,
            ]);
            foreach ($letters as $letter) {
                $group = StudentGroup::firstOrCreate([
                    'academic_year_id' => $cycle->academic_year_id,
                    'academic_level' => $cycle->academic_level,
                    'name' => $letter,
                ], ['group_type' => 'self_registration']);
                $group->update(['group_type' => 'self_registration']);
                foreach ([1, 2] as $number) {
                    $group->subgroups()->firstOrCreate(['name' => $letter.$number], ['min_size' => 1, 'max_size' => $cycle->default_capacity, 'capacity' => $cycle->default_capacity, 'is_active' => true]);
                }
            }
            $this->audit($request, 'group_registration.cycle_created', $cycle->id, ['letters' => $letters]);
            return $cycle;
        });

        return ApiResponse::success($this->cycleData($cycle->load('academicYear')), 'تم إنشاء دورة التسجيل والمجموعات الفارغة.', [], 201);
    }

    public function update(Request $request, GroupRegistrationCycle $cycle): JsonResponse
    {
        $data = $request->validate([
            'status' => ['sometimes', 'in:draft,open,closed,archived'],
            'default_capacity' => ['sometimes', 'integer', 'in:5,6'],
            'opens_at' => ['nullable', 'date'],
            'closes_at' => ['nullable', 'date', 'after:opens_at'],
        ]);
        if (($data['status'] ?? null) === 'open' && $cycle->rosters()->count() === 0) {
            throw ValidationException::withMessages(['status' => ['لا يمكن فتح التسجيل قبل استيراد قائمة الطلبة.']]);
        }
        $cycle->update($data);
        if (isset($data['default_capacity'])) {
            StudentSubgroup::whereHas('group', fn ($q) => $q->where('academic_year_id', $cycle->academic_year_id)->where('academic_level', $cycle->academic_level)->where('group_type', 'self_registration'))
                ->update(['max_size' => $data['default_capacity'], 'capacity' => $data['default_capacity']]);
        }
        $this->audit($request, 'group_registration.cycle_updated', $cycle->id, $data);
        return ApiResponse::success($this->cycleData($cycle->fresh('academicYear')), 'تم تحديث دورة التسجيل.');
    }

    public function importRoster(Request $request, GroupRegistrationCycle $cycle): JsonResponse
    {
        $data = $request->validate([
            'students' => ['required', 'array', 'min:1', 'max:1000'],
            'students.*.university_number' => ['required', 'string', 'max:20'],
            'students.*.full_name_ar' => ['nullable', 'string', 'max:255'],
            'students.*.main_group_code' => ['required', 'string', 'max:2'],
            'students.*.academic_registration_status' => ['required', 'in:registered,unregistered'],
        ]);
        if ($cycle->status === 'archived') abort(409, 'Archived registration cycles cannot be changed.');

        $groups = StudentGroup::where('academic_year_id', $cycle->academic_year_id)
            ->where('academic_level', $cycle->academic_level)->where('group_type', 'self_registration')->get()->keyBy(fn ($g) => strtoupper($g->name));
        $errors = [];
        foreach ($data['students'] as $i => $row) {
            if (!$groups->has(strtoupper(trim($row['main_group_code'])))) $errors["students.$i.main_group_code"][] = 'المجموعة الرئيسية غير معتمدة لهذه السنة.';
            if (!Student::where('university_number', trim($row['university_number']))->exists() && empty($row['full_name_ar'])) $errors["students.$i.full_name_ar"][] = 'اسم الطالب مطلوب عند إضافة رقم جامعي جديد.';
        }
        if ($errors) throw ValidationException::withMessages($errors);

        DB::transaction(function () use ($data, $cycle, $groups) {
            foreach ($data['students'] as $row) {
                $number = trim($row['university_number']);
                $student = Student::firstOrNew(['university_number' => $number]);
                if (!$student->exists) {
                    $student->full_name_ar = trim($row['full_name_ar']);
                    $student->registration_status = 'active';
                }
                if (!empty($row['full_name_ar'])) $student->full_name_ar = trim($row['full_name_ar']);
                $student->academic_level = $cycle->academic_level;
                $student->academic_year_id = $cycle->academic_year_id;
                $student->academic_registration_status = $row['academic_registration_status'];
                $student->university_email = $number.'@'.config('group_registration.student_email_domain');
                $student->data_source = 'group_registration_roster';
                $student->save();
                StudentGroupRoster::updateOrCreate(
                    ['group_registration_cycle_id' => $cycle->id, 'student_id' => $student->id],
                    ['student_group_id' => $groups[strtoupper(trim($row['main_group_code']))]->id]
                );
            }
        });
        $this->audit($request, 'group_registration.roster_imported', $cycle->id, ['count' => count($data['students'])]);
        return ApiResponse::success($this->cycleData($cycle->fresh('academicYear')), 'تم استيراد قائمة الطلبة بنجاح.');
    }

    public function storeSubgroup(Request $request, GroupRegistrationCycle $cycle, StudentGroup $group): JsonResponse
    {
        $this->ensureCycleGroup($cycle, $group);
        $data = $request->validate(['name'=>['required','string','max:10'], 'capacity'=>['required','integer','in:5,6']]);
        if (!str_starts_with(strtoupper($data['name']), strtoupper($group->name))) throw ValidationException::withMessages(['name'=>['اسم المجموعة الفرعية يجب أن يبدأ بحرف المجموعة الرئيسية.']]);
        if ($group->subgroups()->where('name', strtoupper($data['name']))->exists()) throw ValidationException::withMessages(['name'=>['اسم المجموعة الفرعية مستخدم.']]);
        $subgroup = $group->subgroups()->create(['name'=>strtoupper($data['name']), 'min_size'=>1, 'max_size'=>$data['capacity'], 'capacity'=>$data['capacity'], 'is_active'=>true]);
        $this->audit($request, 'group_registration.subgroup_created', $subgroup->id, $data);
        return ApiResponse::success($subgroup, 'تم إنشاء المجموعة الفرعية.', [], 201);
    }

    public function updateSubgroup(Request $request, GroupRegistrationCycle $cycle, StudentSubgroup $subgroup): JsonResponse
    {
        $this->ensureCycleGroup($cycle, $subgroup->group);
        $data = $request->validate(['name'=>['sometimes','string','max:10'], 'capacity'=>['sometimes','integer','in:5,6'], 'is_active'=>['sometimes','boolean']]);
        if (isset($data['capacity']) && $subgroup->assignments()->whereNull('valid_until')->count() > $data['capacity']) throw ValidationException::withMessages(['capacity'=>['لا يمكن تخفيض السعة عن عدد الطلبة المسجلين حالياً.']]);
        if (isset($data['name']) && !str_starts_with(strtoupper($data['name']), strtoupper($subgroup->group->name))) throw ValidationException::withMessages(['name'=>['اسم المجموعة الفرعية يجب أن يبدأ بحرف المجموعة الرئيسية.']]);
        if (isset($data['name']) && $subgroup->group->subgroups()->where('name',strtoupper($data['name']))->where('id','!=',$subgroup->id)->exists()) throw ValidationException::withMessages(['name'=>['اسم المجموعة الفرعية مستخدم.']]);
        if (isset($data['capacity'])) { $data['max_size']=$data['capacity']; }
        if (isset($data['name'])) $data['name']=strtoupper($data['name']);
        $subgroup->update($data);
        $this->audit($request, 'group_registration.subgroup_updated', $subgroup->id, $data);
        return ApiResponse::success($subgroup->fresh(), 'تم تحديث المجموعة الفرعية.');
    }

    public function archiveSubgroup(Request $request, GroupRegistrationCycle $cycle, StudentSubgroup $subgroup): JsonResponse
    {
        $this->ensureCycleGroup($cycle, $subgroup->group);
        if ($subgroup->assignments()->current()->exists()) {
            throw ValidationException::withMessages([
                'subgroup' => ['يجب تفريغ جميع الطلبة من المجموعة الفرعية أولاً، ثم إعادة محاولة الحذف.'],
            ]);
        }

        $subgroupId = $subgroup->id;
        DB::transaction(function () use ($subgroup) {
            // Keep historical membership rows, but release their restrictive FK
            // after the subgroup has no current students so it can be removed fully.
            $subgroup->assignments()->whereNotNull('student_subgroup_id')->update(['student_subgroup_id' => null]);
            $subgroup->delete();
        });
        $this->audit($request, 'group_registration.subgroup_deleted', $subgroupId);
        return ApiResponse::success(null, 'تم حذف المجموعة الفرعية نهائياً.');
    }

    public function overrideAssignment(Request $request, GroupRegistrationCycle $cycle, Student $student): JsonResponse
    {
        $data = $request->validate([
            'student_subgroup_id' => ['nullable', 'integer', 'exists:student_subgroups,id'],
            'reason' => ['required', 'string', 'min:3', 'max:500'],
            'allow_over_capacity' => ['sometimes', 'boolean'],
        ]);
        if ($cycle->status === 'archived') {
            abort(409, 'لا يمكن تعديل دورة تسجيل مؤرشفة.');
        }

        $roster = StudentGroupRoster::with('group')
            ->where('group_registration_cycle_id', $cycle->id)
            ->where('student_id', $student->id)
            ->firstOrFail();

        $approvedBy = $request->user()->name;
        $assignment = DB::transaction(function () use ($data, $cycle, $student, $roster, $approvedBy) {
            $subgroup = null;
            if (! empty($data['student_subgroup_id'])) {
                $subgroup = StudentSubgroup::whereKey($data['student_subgroup_id'])->lockForUpdate()->firstOrFail();
                if (! $subgroup->is_active || (int) $subgroup->student_group_id !== (int) $roster->student_group_id) {
                    throw ValidationException::withMessages([
                        'student_subgroup_id' => ['المجموعة الفرعية لا تتبع المجموعة الرئيسية لهذا الطالب أو أنها غير نشطة.'],
                    ]);
                }
            }

            Student::whereKey($student->id)->lockForUpdate()->firstOrFail();
            $currentAssignments = StudentGroupAssignment::query()
                ->where('student_id', $student->id)
                ->where('academic_year_id', $cycle->academic_year_id)
                ->whereNull('valid_until')
                ->lockForUpdate()
                ->get();

            if ($subgroup && $currentAssignments->count() === 1 && (int) $currentAssignments->first()->student_subgroup_id === (int) $subgroup->id) {
                return $currentAssignments->first();
            }

            if ($subgroup && ! ($data['allow_over_capacity'] ?? false)) {
                $capacity = (int) ($subgroup->capacity ?: $subgroup->max_size ?: $cycle->default_capacity);
                $occupied = StudentGroupAssignment::where('student_subgroup_id', $subgroup->id)
                    ->whereNull('valid_until')->count();
                if ($occupied >= $capacity) {
                    throw ValidationException::withMessages([
                        'student_subgroup_id' => ['المجموعة مكتملة. فعّل التجاوز الإداري فقط عند الضرورة.'],
                    ]);
                }
            }

            foreach ($currentAssignments as $current) {
                $current->update([
                    'valid_until' => now()->toDateString(),
                    'change_reason' => 'administrative_override: '.$data['reason'],
                ]);
            }
            if (! $subgroup) return null;

            return StudentGroupAssignment::create([
                'student_id' => $student->id,
                'academic_year_id' => $cycle->academic_year_id,
                'student_group_id' => $roster->student_group_id,
                'student_subgroup_id' => $subgroup->id,
                'valid_from' => now()->toDateString(),
                'change_reason' => 'administrative_override: '.$data['reason'],
                'approved_by' => $approvedBy,
                'data_source' => 'administrative_override',
            ]);
        });

        AuditLog::create([
            'user_id' => $request->user()->id,
            'action' => $assignment ? 'group_registration.student_overridden' : 'group_registration.student_removed',
            'entity_type' => 'group_registration',
            'entity_id' => $cycle->id,
            'student_id' => $student->id,
            'changes' => ['student_subgroup_id' => $assignment?->student_subgroup_id],
            'is_override' => true,
            'override_reason' => $data['reason'],
        ]);

        return ApiResponse::success(
            $assignment?->load(['group', 'subgroup']),
            $assignment ? 'تم تثبيت/نقل الطالب بنجاح.' : 'تم إخراج الطالب من المجموعة الفرعية.'
        );
    }

    public function export(GroupRegistrationCycle $cycle): StreamedResponse
    {
        $cycle->load('academicYear');
        $rosters = StudentGroupRoster::with(['student', 'group'])
            ->where('group_registration_cycle_id', $cycle->id)
            ->orderBy('student_group_id')->orderBy('student_id')->get();
        $assignments = StudentGroupAssignment::with('subgroup')
            ->where('academic_year_id', $cycle->academic_year_id)
            ->whereIn('student_id', $rosters->pluck('student_id'))
            ->whereNull('valid_until')->get()->keyBy('student_id');
        $filename = sprintf('group-registration-%s-%s.csv', $cycle->academicYear?->code ?: $cycle->academic_year_id, $cycle->academic_level);

        return response()->streamDownload(function () use ($cycle, $rosters, $assignments) {
            $output = fopen('php://output', 'wb');
            fwrite($output, "\xEF\xBB\xBF");
            fputcsv($output, ['الرقم الجامعي', 'اسم الطالب', 'السنة', 'الحالة الأكاديمية', 'المجموعة الرئيسية', 'المجموعة الفرعية', 'حالة الاختيار', 'تاريخ الاختيار']);
            foreach ($rosters as $roster) {
                $assignment = $assignments->get($roster->student_id);
                fputcsv($output, [
                    $this->csvCell($roster->student->university_number),
                    $this->csvCell($roster->student->full_name_ar),
                    $cycle->academic_level,
                    $roster->student->academic_registration_status,
                    $this->csvCell($roster->group->name),
                    $this->csvCell($assignment?->subgroup?->name ?: ''),
                    $assignment ? 'مسجل' : 'لم يختر',
                    $assignment?->created_at?->format('Y-m-d H:i:s') ?: '',
                ]);
            }
            fclose($output);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function cycleData(GroupRegistrationCycle $cycle): array
    {
        $groups = StudentGroup::where('academic_year_id', $cycle->academic_year_id)->where('academic_level', $cycle->academic_level)
            ->where('group_type', 'self_registration')
            ->with(['subgroups' => fn ($q) => $q
                ->withCount(['assignments as current_students_count' => fn ($a) => $a->whereNull('valid_until')])
                ->with(['assignments' => fn ($a) => $a->whereNull('valid_until')->with('student')->orderBy('created_at')])])
            ->orderBy('name')->get()
            ->map(fn (StudentGroup $group) => [
                'id' => $group->id,
                'name' => $group->name,
                'subgroups' => $group->subgroups->map(fn (StudentSubgroup $subgroup) => [
                    'id' => $subgroup->id,
                    'name' => $subgroup->name,
                    'capacity' => (int) ($subgroup->capacity ?: $subgroup->max_size ?: $cycle->default_capacity),
                    'max_size' => (int) ($subgroup->max_size ?: $cycle->default_capacity),
                    'is_active' => (bool) $subgroup->is_active,
                    'current_students_count' => (int) $subgroup->current_students_count,
                    'registered_students' => $subgroup->assignments->map(fn ($assignment) => [
                        'id' => $assignment->student->id,
                        'name' => $assignment->student->full_name_ar,
                        'university_number' => $assignment->student->university_number,
                        'registered_at' => $assignment->created_at?->toIso8601String(),
                    ])->values(),
                ])->values(),
            ])->values();
        $rosters = StudentGroupRoster::with(['student', 'group'])
            ->where('group_registration_cycle_id', $cycle->id)
            ->orderBy('student_group_id')->orderBy('student_id')->get();
        $currentAssignments = StudentGroupAssignment::with('subgroup')
            ->where('academic_year_id', $cycle->academic_year_id)
            ->whereIn('student_id', $rosters->pluck('student_id'))
            ->whereNull('valid_until')->get()->keyBy('student_id');
        $rosterStudents = $rosters->map(function (StudentGroupRoster $roster) use ($currentAssignments) {
            $assignment = $currentAssignments->get($roster->student_id);
            return [
                'id' => $roster->student->id,
                'name' => $roster->student->full_name_ar,
                'university_number' => $roster->student->university_number,
                'academic_registration_status' => $roster->student->academic_registration_status,
                'main_group_id' => $roster->group->id,
                'main_group' => $roster->group->name,
                'student_subgroup_id' => $assignment?->student_subgroup_id,
                'student_subgroup' => $assignment?->subgroup?->name,
            ];
        })->values();
        return [
            'id'=>$cycle->id, 'public_id'=>$cycle->public_id, 'academic_year_id'=>$cycle->academic_year_id,
            'academic_year'=>$cycle->academicYear, 'academic_level'=>$cycle->academic_level, 'status'=>$cycle->status,
            'default_capacity'=>$cycle->default_capacity, 'opens_at'=>$cycle->opens_at, 'closes_at'=>$cycle->closes_at,
            'rosters_count'=>$cycle->rosters()->count(), 'registered_rosters_count'=>$cycle->rosters()->whereHas('student', fn($q)=>$q->where('academic_registration_status','registered'))->count(),
            'public_url'=>'/student-registration/'.$cycle->public_id, 'groups'=>$groups, 'roster_students'=>$rosterStudents,
        ];
    }

    private function csvCell(?string $value): string
    {
        $value = (string) $value;
        return preg_match('/^[=+\-@]/u', $value) ? "'".$value : $value;
    }

    private function ensureCycleGroup(GroupRegistrationCycle $cycle, StudentGroup $group): void
    {
        abort_unless($group->academic_year_id === $cycle->academic_year_id && $group->academic_level === $cycle->academic_level && $group->group_type === 'self_registration', 404);
    }
    private function audit(Request $request, string $action, int $id, array $changes=[]): void
    {
        AuditLog::create(['user_id'=>$request->user()->id,'action'=>$action,'entity_type'=>'group_registration','entity_id'=>$id,'changes'=>$changes]);
    }
}

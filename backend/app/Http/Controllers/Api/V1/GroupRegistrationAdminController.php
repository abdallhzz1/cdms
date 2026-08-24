<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AuditLog;
use App\Models\GroupRegistrationCycle;
use App\Models\Student;
use App\Models\StudentGroup;
use App\Models\StudentGroupRoster;
use App\Models\StudentSubgroup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

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
        if ($subgroup->assignments()->exists()) $subgroup->update(['is_active'=>false]); else $subgroup->delete();
        $this->audit($request, 'group_registration.subgroup_archived', $subgroup->id);
        return ApiResponse::success(null, 'تم حذف/أرشفة المجموعة الفرعية.');
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
        return [
            'id'=>$cycle->id, 'public_id'=>$cycle->public_id, 'academic_year_id'=>$cycle->academic_year_id,
            'academic_year'=>$cycle->academicYear, 'academic_level'=>$cycle->academic_level, 'status'=>$cycle->status,
            'default_capacity'=>$cycle->default_capacity, 'opens_at'=>$cycle->opens_at, 'closes_at'=>$cycle->closes_at,
            'rosters_count'=>$cycle->rosters()->count(), 'registered_rosters_count'=>$cycle->rosters()->whereHas('student', fn($q)=>$q->where('academic_registration_status','registered'))->count(),
            'public_url'=>'/student-registration/'.$cycle->public_id, 'groups'=>$groups,
        ];
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

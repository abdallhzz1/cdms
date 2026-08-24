<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AcademicYear;
use App\Models\AuditLog;
use App\Models\Course;
use App\Models\DistributionVersion;
use App\Models\Person;
use App\Models\Role;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use App\Models\TrainingSite;
use App\Models\User;
use App\Services\Distribution\DistributionApprovalService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class CourseDistributionController extends Controller
{
    public function __construct(private readonly DistributionApprovalService $approvalService) {}

    public function options(): JsonResponse
    {
        $directory = $this->doctorDirectory();

        return ApiResponse::success([
            'academic_years' => AcademicYear::query()->active()
                ->orderByDesc('is_current')->orderByDesc('start_date')
                ->get(['id', 'code', 'start_date', 'end_date', 'is_current']),
            'courses' => Course::query()->where('is_active', true)
                ->whereIn('academic_level', ['fourth', 'fifth', 'sixth'])
                ->orderBy('academic_level')->orderBy('semester')->orderBy('code')
                ->get(['id', 'code', 'name_ar', 'name_en', 'academic_level', 'semester']),
            'hospitals' => $this->hospitals($directory),
            'unassigned_doctors' => $directory->filter(fn ($doctor) => count($doctor['training_site_ids']) === 0)->values(),
        ]);
    }

    public function schedule(Request $request): JsonResponse
    {
        $data = $request->validate([
            'academic_year_id' => ['required', 'integer', 'exists:academic_years,id'],
            'academic_level' => ['required', 'in:fourth,fifth,sixth'],
            'course_id' => ['required', 'integer', 'exists:courses,id'],
        ]);

        $directory = $this->doctorDirectory();
        $rotation = Rotation::query()
            ->with(['academicYear', 'course', 'blocks'])
            ->where('academic_year_id', $data['academic_year_id'])
            ->where('academic_level', $data['academic_level'])
            ->where('course_id', $data['course_id'])
            ->first();

        if (! $rotation) {
            return ApiResponse::success([
                'rotation' => null,
                'version' => null,
                'blocks' => [],
                'subgroups' => $this->subgroups((int) $data['academic_year_id'], $data['academic_level']),
                'hospitals' => $this->hospitals($directory),
                'unassigned_doctors' => $directory->filter(fn ($doctor) => count($doctor['training_site_ids']) === 0)->values(),
                'cells' => [],
            ]);
        }

        $version = DistributionVersion::query()
            ->where('rotation_id', $rotation->id)
            ->orderByRaw("CASE WHEN status = 'published' THEN 1 ELSE 0 END")
            ->latest('id')
            ->first();

        $cells = collect();
        if ($version) {
            $cells = StudentClinicalAssignment::query()
                ->where('distribution_version_id', $version->id)
                ->whereNotNull('student_subgroup_id')
                ->with(['studentSubgroup:id,name,student_group_id', 'studentSubgroup.group:id,name'])
                ->select(['student_subgroup_id', 'rotation_block_id', 'supervisor_id', 'training_site_id'])
                ->distinct()
                ->get()
                ->map(fn ($assignment) => [
                    'rotation_block_id' => $assignment->rotation_block_id,
                    'supervisor_id' => $assignment->supervisor_id,
                    'training_site_id' => $assignment->training_site_id,
                    'subgroup_id' => $assignment->student_subgroup_id,
                    'subgroup_name' => $assignment->studentSubgroup?->name,
                    'main_group_name' => $assignment->studentSubgroup?->group?->name,
                ])->values();
        }

        return ApiResponse::success([
            'rotation' => $rotation,
            'version' => $version,
            'blocks' => $rotation->blocks->sortBy('from_week')->values(),
            'subgroups' => $this->subgroups($rotation->academic_year_id, $rotation->academic_level),
            'hospitals' => $this->hospitals($directory),
            'unassigned_doctors' => $directory->filter(fn ($doctor) => count($doctor['training_site_ids']) === 0)->values(),
            'cells' => $cells,
        ]);
    }

    public function createSchedule(Request $request): JsonResponse
    {
        $data = $request->validate([
            'academic_year_id' => ['required', 'integer', 'exists:academic_years,id'],
            'academic_level' => ['required', 'in:fourth,fifth,sixth'],
            'course_id' => ['required', 'integer', 'exists:courses,id'],
            'start_date' => ['required', 'date'],
            'weeks_count' => ['required', 'integer', 'min:1', 'max:52'],
        ]);
        $course = Course::findOrFail($data['course_id']);
        if ($course->academic_level !== $data['academic_level']) {
            throw ValidationException::withMessages(['course_id' => ['المساق لا يتبع الدفعة المحددة.']]);
        }
        if (Rotation::where('academic_year_id', $data['academic_year_id'])->where('course_id', $course->id)->exists()) {
            throw ValidationException::withMessages(['course_id' => ['يوجد جدول منشأ مسبقًا لهذا المساق والعام.']]);
        }

        [$rotation, $version] = DB::transaction(function () use ($data, $course) {
            $year = AcademicYear::findOrFail($data['academic_year_id']);
            $rotation = Rotation::create([
                'academic_year_id' => $year->id,
                'course_id' => $course->id,
                'code' => 'COURSE-'.$course->id.'-YEAR-'.$year->id,
                'name' => $course->name_ar,
                'academic_level' => $data['academic_level'],
                'duration_weeks' => $data['weeks_count'],
                'start_date' => $data['start_date'],
                'end_date' => Carbon::parse($data['start_date'])->addWeeks($data['weeks_count'])->subDay()->toDateString(),
                'status' => 'active',
            ]);
            $rotation->blocks()->createMany(collect(range(1, $data['weeks_count']))->map(fn ($week) => [
                'block_code' => 'W'.$week,
                'from_week' => $week,
                'to_week' => $week,
            ])->all());
            $version = DistributionVersion::create([
                'rotation_id' => $rotation->id,
                'name' => 'جدول '.$course->name_ar.' - '.$year->code,
                'status' => 'manual',
            ]);
            return [$rotation, $version];
        });

        return ApiResponse::success(['rotation' => $rotation, 'version' => $version], 'تم إنشاء جدول المساق.', [], 201);
    }

    public function assignCell(Request $request, DistributionVersion $version): JsonResponse
    {
        if ($version->status === 'published') {
            throw ValidationException::withMessages(['version' => ['لا يمكن تعديل جدول منشور.']]);
        }
        $data = $request->validate([
            'rotation_block_id' => ['required', 'integer', 'exists:rotation_blocks,id'],
            'supervisor_id' => ['required', 'integer', 'exists:people,id'],
            'training_site_id' => ['required', 'integer', 'exists:training_sites,id'],
            'subgroup_id' => ['required', 'integer', 'exists:student_subgroups,id'],
        ]);
        $version->loadMissing('rotation');
        $block = RotationBlock::where('rotation_id', $version->rotation_id)->findOrFail($data['rotation_block_id']);
        $doctor = Person::active()->findOrFail($data['supervisor_id']);
        if (! $doctor->trainingSites()->whereKey($data['training_site_id'])->exists()
            && $doctor->primary_site_id !== $data['training_site_id']) {
            throw ValidationException::withMessages(['training_site_id' => ['الطبيب غير مرتبط بالمستشفى المحدد.']]);
        }
        $subgroup = StudentSubgroup::with('group')->findOrFail($data['subgroup_id']);
        if (! $subgroup->is_active || ! $subgroup->group
            || $subgroup->group->academic_year_id !== $version->rotation->academic_year_id
            || $subgroup->group->academic_level !== $version->rotation->academic_level) {
            throw ValidationException::withMessages(['subgroup_id' => ['المجموعة لا تتبع الدفعة والعام المحددين.']]);
        }

        $conflict = StudentClinicalAssignment::query()
            ->where('distribution_version_id', $version->id)
            ->where('rotation_block_id', $block->id)
            ->where('student_subgroup_id', $subgroup->id)
            ->where('supervisor_id', '!=', $doctor->id)
            ->exists();
        if ($conflict) {
            throw ValidationException::withMessages(['subgroup_id' => ['هذه المجموعة موزعة على طبيب آخر في الأسبوع نفسه.']]);
        }

        DB::transaction(function () use ($version, $block, $doctor, $subgroup, $data) {
            StudentClinicalAssignment::where([
                'distribution_version_id' => $version->id,
                'rotation_block_id' => $block->id,
                'supervisor_id' => $doctor->id,
            ])->delete();

            $memberships = StudentGroupAssignment::query()
                ->where('student_subgroup_id', $subgroup->id)
                ->where('academic_year_id', $version->rotation->academic_year_id)
                ->current()
                ->whereHas('student', fn ($query) => $query->where('registration_status', 'active'))
                ->get();
            if ($memberships->isEmpty()) {
                throw ValidationException::withMessages(['subgroup_id' => ['لا يوجد طلبة مسجلون حاليًا في هذه المجموعة.']]);
            }
            $now = now();
            StudentClinicalAssignment::insert($memberships->map(fn ($membership) => [
                'distribution_version_id' => $version->id,
                'student_id' => $membership->student_id,
                'student_subgroup_id' => $subgroup->id,
                'rotation_block_id' => $block->id,
                'training_site_id' => $data['training_site_id'],
                'department_id' => $doctor->department_id,
                'supervisor_id' => $doctor->id,
                'created_at' => $now,
                'updated_at' => $now,
            ])->all());
        });

        $this->recordCellChange($request, $version, 'course_schedule.cell_saved', $data);

        return ApiResponse::success(null, 'تم حفظ خلية الجدول.');
    }

    public function clearCell(Request $request, DistributionVersion $version): JsonResponse
    {
        if ($version->status === 'published') {
            throw ValidationException::withMessages(['version' => ['لا يمكن تعديل جدول منشور.']]);
        }
        $data = $request->validate([
            'rotation_block_id' => ['required', 'integer', 'exists:rotation_blocks,id'],
            'supervisor_id' => ['required', 'integer', 'exists:people,id'],
        ]);
        $version->loadMissing('rotation');
        RotationBlock::where('rotation_id', $version->rotation_id)->findOrFail($data['rotation_block_id']);
        Person::active()->whereNotNull('primary_site_id')->findOrFail($data['supervisor_id']);
        StudentClinicalAssignment::where([
            'distribution_version_id' => $version->id,
            'rotation_block_id' => $data['rotation_block_id'],
            'supervisor_id' => $data['supervisor_id'],
        ])->delete();
        $this->recordCellChange($request, $version, 'course_schedule.cell_cleared', $data);
        return ApiResponse::success(null, 'تم تفريغ خلية الجدول.');
    }

    public function storeDoctor(Request $request): JsonResponse
    {
        $data = $request->validate([
            'full_name_ar' => ['required', 'string', 'max:255'],
            'full_name_en' => ['nullable', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email', 'unique:people,email'],
            'password' => ['required', 'string', Password::min(12)->mixedCase()->numbers()->symbols()],
            'primary_site_id' => ['required', 'integer', 'exists:training_sites,id'],
            'specialty' => ['nullable', 'string', 'max:255'],
        ]);

        $person = DB::transaction(function () use ($data) {
            $user = User::create([
                'name' => $data['full_name_ar'],
                'email' => strtolower($data['email']),
                'password' => $data['password'],
                'is_active' => true,
            ]);
            $role = Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail();
            $user->roles()->attach($role->id);
            $person = Person::create([
                'full_name_ar' => $data['full_name_ar'],
                'full_name_en' => $data['full_name_en'] ?? null,
                'email' => strtolower($data['email']),
                'primary_site_id' => $data['primary_site_id'],
                'specialty' => $data['specialty'] ?? null,
                'is_active' => true,
                'user_id' => $user->id,
            ]);
            $person->trainingSites()->attach($data['primary_site_id'], ['is_primary' => true]);

            return $person;
        });

        return ApiResponse::success($person->load('primarySite'), 'تم إنشاء الطبيب وحساب المشرف السريري.', [], 201);
    }

    public function assignDoctorHospital(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'primary_site_id' => ['nullable', 'integer', 'exists:training_sites,id'],
        ]);

        if (! $user->hasRole('CLINICAL_SUPERVISOR')) {
            throw ValidationException::withMessages([
                'user_id' => ['الحساب المحدد لا يحمل دور مشرف سريري.'],
            ]);
        }

        if (isset($data['primary_site_id']) && ! TrainingSite::query()->active()->whereKey($data['primary_site_id'])->exists()) {
            throw ValidationException::withMessages([
                'primary_site_id' => ['المستشفى المحدد غير فعال.'],
            ]);
        }

        $person = DB::transaction(function () use ($user, $data) {
            $person = Person::query()->where('user_id', $user->id)->first()
                ?? Person::query()->whereNull('user_id')->whereRaw('LOWER(email) = ?', [strtolower($user->email)])->first()
                ?? new Person();

            $person->fill([
                'full_name_ar' => $person->full_name_ar ?: $user->name,
                'email' => strtolower($user->email),
                'user_id' => $user->id,
                'primary_site_id' => $data['primary_site_id'] ?? null,
                'is_active' => $user->is_active,
            ])->save();

            if ($person->primary_site_id) {
                $person->trainingSites()->sync([
                    $person->primary_site_id => ['is_primary' => true],
                ]);
            } else {
                $person->trainingSites()->detach();
            }

            return $person;
        });

        AuditLog::create([
            'user_id' => $request->user()->id,
            'action' => 'clinical_supervisor.hospital_assigned',
            'entity_type' => User::class,
            'entity_id' => $user->id,
            'changes' => ['primary_site_id' => $person->primary_site_id],
            'is_override' => false,
        ]);

        return ApiResponse::success(null, $person->primary_site_id ? 'تم ربط الطبيب بالمستشفى.' : 'تم إلغاء ربط الطبيب بالمستشفى.');
    }

    private function subgroups(int $academicYearId, string $academicLevel)
    {
        return StudentSubgroup::query()->with('group:id,name')
            ->withCount(['assignments as students_count' => fn ($query) => $query->current()->where('academic_year_id', $academicYearId)])
            ->where('is_active', true)
            ->whereHas('group', fn ($query) => $query->where('academic_year_id', $academicYearId)->where('academic_level', $academicLevel))
            ->get(['id', 'student_group_id', 'name', 'capacity'])->sortBy(fn ($group) => ($group->group?->name ?? '').$group->name)->values();
    }

    private function doctorDirectory()
    {
        $activeSiteIds = TrainingSite::query()->active()->pluck('id');

        return User::query()
            ->where('is_active', true)
            ->whereHas('roles', fn ($query) => $query->where('code', 'CLINICAL_SUPERVISOR'))
            ->with('person.trainingSites:id')
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'is_active'])
            ->map(function (User $user) use ($activeSiteIds) {
                $person = $user->person;
                $siteId = $person?->primary_site_id;
                $siteIds = $person?->trainingSites->pluck('id')->filter(fn ($id) => $activeSiteIds->contains($id))->values() ?? collect();
                if ($siteId && $activeSiteIds->contains($siteId) && ! $siteIds->contains($siteId)) {
                    $siteIds->push($siteId);
                }

                return [
                    'id' => $person?->id,
                    'user_id' => $user->id,
                    'full_name_ar' => $person?->full_name_ar ?: $user->name,
                    'full_name_en' => $person?->full_name_en,
                    'email' => $user->email,
                    'specialty' => $person?->specialty,
                    'primary_site_id' => $siteId && $activeSiteIds->contains($siteId) ? $siteId : null,
                    'training_site_ids' => $siteIds->values(),
                ];
            });
    }

    private function hospitals($directory)
    {
        return TrainingSite::query()->active()->orderBy('name_ar')
            ->get(['id', 'site_code', 'name_ar', 'name_en', 'site_type', 'city'])
            ->map(function (TrainingSite $site) use ($directory) {
                $site->setAttribute('supervisors', $directory
                    ->filter(fn ($doctor) => collect($doctor['training_site_ids'])->contains($site->id))
                    ->filter(fn ($doctor) => $doctor['id'] !== null)
                    ->values());

                return $site;
            });
    }

    private function recordCellChange(Request $request, DistributionVersion $version, string $action, array $data): void
    {
        AuditLog::create([
            'user_id' => $request->user()->id,
            'action' => $action,
            'entity_type' => DistributionVersion::class,
            'entity_id' => $version->id,
            'distribution_version_id' => $version->id,
            'changes' => $data,
            'is_override' => false,
        ]);
        $this->approvalService->invalidateApproval($version, $request->user());
    }
}

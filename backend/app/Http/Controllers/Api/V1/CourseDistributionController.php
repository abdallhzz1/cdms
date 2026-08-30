<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AcademicYear;
use App\Models\AuditLog;
use App\Models\Course;
use App\Models\CourseScheduleCell;
use App\Models\CourseScheduleBlockActivity;
use App\Models\CourseScheduleRow;
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
use App\Traits\ScopesByDepartmentAndLevel;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class CourseDistributionController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function __construct(private readonly DistributionApprovalService $approvalService) {}

    public function options(): JsonResponse
    {
        $directory = $this->doctorDirectory();
        $levelScope = $this->getEffectiveAcademicLevelScope();

        return ApiResponse::success([
            'academic_years' => AcademicYear::query()->active()
                ->orderByDesc('is_current')->orderByDesc('start_date')
                ->get(['id', 'code', 'start_date', 'end_date', 'is_current']),
            'courses' => Course::query()->where('is_active', true)
                ->whereIn('academic_level', ['fourth', 'fifth', 'sixth'])
                ->when($levelScope !== null, fn ($query) => $query->whereIn('academic_level', $levelScope))
                ->orderBy('academic_level')->orderBy('semester')->orderBy('code')
                ->get(['id', 'code', 'name_ar', 'name_en', 'academic_level', 'semester']),
            'hospitals' => $this->hospitals($directory),
            'unassigned_doctors' => $directory->filter(fn ($doctor) => count($doctor['training_site_ids']) === 0)->values(),
        ]);
    }

    public function clinicalWorkforce(): JsonResponse
    {
        $directory = $this->doctorDirectory();

        return ApiResponse::success([
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
        $this->ensureAcademicLevelInUserScope($data['academic_level']);

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
                'current_published_version' => null,
                'blocks' => [],
                'subgroups' => $this->subgroups((int) $data['academic_year_id'], $data['academic_level']),
                'hospitals' => $this->hospitals($directory),
                'unassigned_doctors' => $directory->filter(fn ($doctor) => count($doctor['training_site_ids']) === 0)->values(),
                'rows' => [],
                'cells' => [],
            ]);
        }

        $currentPublishedVersion = DistributionVersion::query()
            ->where('rotation_id', $rotation->id)
            ->where('status', 'published')->where('is_current', true)
            ->latest('id')->first();
        $version = DistributionVersion::query()
            ->where('rotation_id', $rotation->id)
            ->orderByRaw("CASE WHEN status IN ('draft', 'suggested', 'manual') THEN 0 WHEN status = 'published' AND is_current = 1 THEN 1 WHEN status = 'published' THEN 2 ELSE 3 END")
            ->latest('id')
            ->first();

        $cells = collect();
        $rows = collect();
        $approvalState = null;
        if ($version) {
            $rows = CourseScheduleRow::query()
                ->where('distribution_version_id', $version->id)
                ->with(['person:id,full_name_ar,full_name_en,email,specialty', 'trainingSite:id,name_ar,name_en,site_code'])
                ->orderBy('sort_order')->orderBy('id')->get();
            $cells = CourseScheduleCell::query()
                ->where('distribution_version_id', $version->id)
                ->with(['studentSubgroup:id,name,student_group_id', 'studentSubgroup.group:id,name'])
                ->get()
                ->map(fn ($cell) => [
                    'course_schedule_row_id' => $cell->course_schedule_row_id,
                    'rotation_block_id' => $cell->rotation_block_id,
                    'subgroup_id' => $cell->student_subgroup_id,
                    'subgroup_name' => $cell->studentSubgroup?->name,
                    'main_group_name' => $cell->studentSubgroup?->group?->name,
                ])->values();
            $approvalState = $this->approvalService->getApprovalState($version);
        }

        $blocks = $rotation->blocks->sortBy('from_week')->values();
        if ($version) {
            $activities = CourseScheduleBlockActivity::where('distribution_version_id', $version->id)->get()->keyBy('rotation_block_id');
            $blocks->each(function (RotationBlock $block) use ($activities) {
                $activity = $activities->get($block->id);
                $block->setAttribute('activity_type', $activity?->activity_type ?? 'clinical');
                $block->setAttribute('activity_label', $activity?->activity_label);
                $block->setAttribute('activity_scope', $activity?->activity_scope ?? 'all');
                $block->setAttribute('main_group_codes', $activity?->main_group_codes);
            });
        }

        return ApiResponse::success([
            'rotation' => $rotation,
            'version' => $version,
            'current_published_version' => $currentPublishedVersion,
            'approval_state' => $approvalState,
            'blocks' => $blocks,
            'subgroups' => $this->subgroups($rotation->academic_year_id, $rotation->academic_level),
            'hospitals' => $this->hospitals($directory),
            'unassigned_doctors' => $directory->filter(fn ($doctor) => count($doctor['training_site_ids']) === 0)->values(),
            'rows' => $rows,
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
        $this->ensureAcademicLevelInUserScope($data['academic_level']);
        $course = Course::findOrFail($data['course_id']);
        if ($course->academic_level !== $data['academic_level']) {
            throw ValidationException::withMessages(['course_id' => ['المساق لا يتبع الدفعة المحددة.']]);
        }
        if (Rotation::where('academic_year_id', $data['academic_year_id'])->where('course_id', $course->id)->exists()) {
            throw ValidationException::withMessages(['course_id' => ['يوجد جدول منشأ مسبقًا لهذا المساق والعام.']]);
        }

        $year = AcademicYear::findOrFail($data['academic_year_id']);
        $scheduleStart = Carbon::parse($data['start_date'])->startOfDay();
        $scheduleEnd = $scheduleStart->copy()->addWeeks($data['weeks_count'])->subDay();
        if ($scheduleStart->lt(Carbon::parse($year->start_date)) || $scheduleEnd->gt(Carbon::parse($year->end_date)->endOfDay())) {
            throw ValidationException::withMessages([
                'start_date' => ['يجب أن يقع الجدول كاملًا ضمن بداية ونهاية العام الأكاديمي المحدد.'],
            ]);
        }

        [$rotation, $version] = DB::transaction(function () use ($data, $course, $year) {
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
        $this->ensureVersionInUserScope($version);
        if (in_array($version->status, ['published', 'withdrawn'], true)) {
            throw ValidationException::withMessages(['version' => ['أنشئ نسخة تعديل قبل تغيير جدول منشور أو ملغى النشر.']]);
        }
        $data = $request->validate([
            'rotation_block_id' => ['required', 'integer', 'exists:rotation_blocks,id'],
            'course_schedule_row_id' => ['required', 'integer', 'exists:course_schedule_rows,id'],
            'subgroup_id' => ['required', 'integer', 'exists:student_subgroups,id'],
        ]);
        $version->loadMissing('rotation');
        $block = RotationBlock::where('rotation_id', $version->rotation_id)->findOrFail($data['rotation_block_id']);
        $row = CourseScheduleRow::where('distribution_version_id', $version->id)->findOrFail($data['course_schedule_row_id']);
        $doctor = $row->person;
        $subgroup = StudentSubgroup::with('group')->findOrFail($data['subgroup_id']);
        if (! $subgroup->is_active || ! $subgroup->group
            || $subgroup->group->academic_year_id !== $version->rotation->academic_year_id
            || $subgroup->group->academic_level !== $version->rotation->academic_level) {
            throw ValidationException::withMessages(['subgroup_id' => ['المجموعة لا تتبع الدفعة والعام المحددين.']]);
        }
        if ($this->blockExcludesGroup($version, $block, $subgroup->group->name)) {
            throw ValidationException::withMessages(['subgroup_id' => ['هذه المجموعة مشمولة بنشاط غير سريري في هذا الأسبوع ولا يمكن توزيعها على طبيب.']]);
        }

        $conflict = CourseScheduleCell::query()
            ->where('distribution_version_id', $version->id)
            ->where('rotation_block_id', $block->id)
            ->where('student_subgroup_id', $subgroup->id)
            ->where('course_schedule_row_id', '!=', $row->id)
            ->exists();
        if ($conflict) {
            throw ValidationException::withMessages(['subgroup_id' => ['هذه المجموعة موزعة على طبيب آخر في الأسبوع نفسه.']]);
        }

        DB::transaction(function () use ($version, $block, $row, $doctor, $subgroup) {
            CourseScheduleCell::updateOrCreate([
                'distribution_version_id' => $version->id,
                'rotation_block_id' => $block->id,
                'course_schedule_row_id' => $row->id,
            ], [
                'student_subgroup_id' => $subgroup->id,
            ]);

            StudentClinicalAssignment::where([
                'distribution_version_id' => $version->id,
                'rotation_block_id' => $block->id,
                'course_schedule_row_id' => $row->id,
            ])->delete();

            $memberships = StudentGroupAssignment::query()
                ->where('student_subgroup_id', $subgroup->id)
                ->where('academic_year_id', $version->rotation->academic_year_id)
                ->current()
                ->whereHas('student', fn ($query) => $query->where('registration_status', 'active'))
                ->get();
            StudentClinicalAssignment::query()
                ->where('distribution_version_id', $version->id)
                ->where('rotation_block_id', $block->id)
                ->whereNull('course_schedule_row_id')
                ->whereIn('student_id', $memberships->pluck('student_id'))
                ->delete();
            $now = now();
            if ($memberships->isNotEmpty()) {
                StudentClinicalAssignment::insert($memberships->map(fn ($membership) => [
                    'distribution_version_id' => $version->id,
                    'course_schedule_row_id' => $row->id,
                    'student_id' => $membership->student_id,
                    'student_subgroup_id' => $subgroup->id,
                    'rotation_block_id' => $block->id,
                    'training_site_id' => $row->training_site_id,
                    'department_id' => $doctor?->department_id,
                    'supervisor_id' => $doctor?->id,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])->all());
            }
        });

        $this->recordCellChange($request, $version, 'course_schedule.cell_saved', $data);

        return ApiResponse::success(null, 'تم حفظ خلية الجدول.');
    }

    public function clearCell(Request $request, DistributionVersion $version): JsonResponse
    {
        $this->ensureVersionInUserScope($version);
        if (in_array($version->status, ['published', 'withdrawn'], true)) {
            throw ValidationException::withMessages(['version' => ['أنشئ نسخة تعديل قبل تغيير جدول منشور أو ملغى النشر.']]);
        }
        $data = $request->validate([
            'rotation_block_id' => ['required', 'integer', 'exists:rotation_blocks,id'],
            'course_schedule_row_id' => ['required', 'integer', 'exists:course_schedule_rows,id'],
        ]);
        $version->loadMissing('rotation');
        RotationBlock::where('rotation_id', $version->rotation_id)->findOrFail($data['rotation_block_id']);
        CourseScheduleRow::where('distribution_version_id', $version->id)->findOrFail($data['course_schedule_row_id']);
        DB::transaction(function () use ($version, $data) {
            CourseScheduleCell::where([
                'distribution_version_id' => $version->id,
                'rotation_block_id' => $data['rotation_block_id'],
                'course_schedule_row_id' => $data['course_schedule_row_id'],
            ])->delete();
            StudentClinicalAssignment::where([
                'distribution_version_id' => $version->id,
                'rotation_block_id' => $data['rotation_block_id'],
                'course_schedule_row_id' => $data['course_schedule_row_id'],
            ])->delete();
        });
        $this->recordCellChange($request, $version, 'course_schedule.cell_cleared', $data);
        return ApiResponse::success(null, 'تم تفريغ خلية الجدول.');
    }

    public function updateBlockActivity(Request $request, DistributionVersion $version, RotationBlock $block): JsonResponse
    {
        $this->ensureVersionInUserScope($version);
        $this->ensureEditableVersion($version);
        abort_unless((int) $block->rotation_id === (int) $version->rotation_id, 404);

        $data = $request->validate([
            'activity_type' => ['required', 'in:clinical,lectures,break,exam'],
            'activity_label' => ['nullable', 'string', 'max:255'],
            'activity_scope' => ['required', 'in:all,main_groups'],
            'main_group_codes' => ['nullable', 'array'],
            'main_group_codes.*' => ['string', 'max:50'],
        ]);

        if ($data['activity_type'] === 'clinical') {
            $data['activity_label'] = null;
            $data['activity_scope'] = 'all';
            $data['main_group_codes'] = null;
        } else {
            $data['activity_label'] = trim($data['activity_label'] ?? '') ?: match ($data['activity_type']) {
                'lectures' => 'محاضرات',
                'break' => 'إجازة',
                'exam' => 'امتحانات',
            };
            $codes = collect($data['main_group_codes'] ?? [])->map(fn ($code) => trim($code))->filter()->unique()->values();
            if ($data['activity_scope'] === 'main_groups' && $codes->isEmpty()) {
                throw ValidationException::withMessages(['main_group_codes' => ['اختر مجموعة رئيسية واحدة على الأقل.']]);
            }
            $validCodes = \App\Models\StudentGroup::query()
                ->where('academic_year_id', $version->rotation->academic_year_id)
                ->where('academic_level', $version->rotation->academic_level)
                ->whereIn('name', $codes)->pluck('name');
            if ($data['activity_scope'] === 'main_groups' && $validCodes->count() !== $codes->count()) {
                throw ValidationException::withMessages(['main_group_codes' => ['إحدى المجموعات الرئيسية المحددة لا تتبع الدفعة الحالية.']]);
            }
            $data['main_group_codes'] = $data['activity_scope'] === 'all' ? null : $validCodes->values()->all();
        }

        DB::transaction(function () use ($block, $version, $data) {
            CourseScheduleBlockActivity::updateOrCreate([
                'distribution_version_id' => $version->id,
                'rotation_block_id' => $block->id,
            ], $data);
            if ($data['activity_type'] === 'clinical') {
                return;
            }

            $cells = CourseScheduleCell::query()
                ->where('distribution_version_id', $version->id)
                ->where('rotation_block_id', $block->id)
                ->when($data['activity_scope'] === 'main_groups', fn ($query) => $query->whereHas(
                    'studentSubgroup.group',
                    fn ($group) => $group->whereIn('name', $data['main_group_codes'])
                ));
            $cellIds = (clone $cells)->pluck('id');
            StudentClinicalAssignment::query()
                ->where('distribution_version_id', $version->id)
                ->where('rotation_block_id', $block->id)
                ->when($data['activity_scope'] === 'main_groups', fn ($query) => $query->whereHas(
                    'studentSubgroup.group',
                    fn ($group) => $group->whereIn('name', $data['main_group_codes'])
                ))->delete();
            CourseScheduleCell::whereIn('id', $cellIds)->delete();
        });

        $this->recordCellChange($request, $version, 'course_schedule.block_activity_updated', [
            'rotation_block_id' => $block->id,
        ] + $data);

        return ApiResponse::success(null, 'تم تحديث نوع الأسبوع ونطاقه.');
    }

    public function storeScheduleRow(Request $request, DistributionVersion $version): JsonResponse
    {
        $this->ensureVersionInUserScope($version);
        $this->ensureEditableVersion($version);
        $data = $this->validateScheduleRow($request);
        $data['distribution_version_id'] = $version->id;
        $data['sort_order'] = (int) CourseScheduleRow::where('distribution_version_id', $version->id)->max('sort_order') + 1;
        $row = CourseScheduleRow::create($data);
        $this->recordCellChange($request, $version, 'course_schedule.row_created', ['row_id' => $row->id] + $data);

        return ApiResponse::success($row->load(['person', 'trainingSite']), 'تمت إضافة صف الجدول.', [], 201);
    }

    public function updateScheduleRow(Request $request, DistributionVersion $version, CourseScheduleRow $row): JsonResponse
    {
        $this->ensureVersionInUserScope($version);
        $this->ensureEditableVersion($version);
        abort_unless((int) $row->distribution_version_id === (int) $version->id, 404);
        $data = $this->validateScheduleRow($request, $row);

        DB::transaction(function () use ($row, $data) {
            $row->update($data);
            StudentClinicalAssignment::where('course_schedule_row_id', $row->id)->update([
                'supervisor_id' => $row->person_id,
                'training_site_id' => $row->training_site_id,
                'department_id' => $row->person?->department_id,
            ]);
        });
        $this->recordCellChange($request, $version, 'course_schedule.row_updated', ['row_id' => $row->id] + $data);

        return ApiResponse::success($row->fresh()->load(['person', 'trainingSite']), 'تم تعديل صف الجدول.');
    }

    public function destroyScheduleRow(Request $request, DistributionVersion $version, CourseScheduleRow $row): JsonResponse
    {
        $this->ensureVersionInUserScope($version);
        $this->ensureEditableVersion($version);
        abort_unless((int) $row->distribution_version_id === (int) $version->id, 404);

        DB::transaction(function () use ($row) {
            StudentClinicalAssignment::where('course_schedule_row_id', $row->id)->delete();
            $row->delete();
        });
        $this->recordCellChange($request, $version, 'course_schedule.row_deleted', ['row_id' => $row->id]);

        return ApiResponse::success(null, 'تم حذف صف الجدول وما يحتويه من توزيعات.');
    }

    public function reviseSchedule(Request $request, DistributionVersion $version): JsonResponse
    {
        $this->ensureVersionInUserScope($version);
        if (! in_array($version->status, ['published', 'withdrawn'], true)) {
            throw ValidationException::withMessages(['version' => ['يمكن إنشاء نسخة تعديل من جدول منشور أو ملغى النشر فقط.']]);
        }

        $existing = DistributionVersion::query()
            ->where('source_version_id', $version->id)
            ->whereIn('status', ['draft', 'suggested', 'manual'])
            ->latest('id')->first();
        if ($existing) {
            return ApiResponse::success($existing, 'توجد نسخة تعديل مفتوحة مسبقاً.');
        }

        $revision = DB::transaction(function () use ($request, $version) {
            $revision = DistributionVersion::create([
                'rotation_id' => $version->rotation_id,
                'source_version_id' => $version->id,
                'name' => trim(($version->name ?: 'جدول سريري').' — نسخة تعديل'),
                'status' => 'manual',
                'is_current' => false,
            ]);

            $rowMap = [];
            foreach (CourseScheduleRow::where('distribution_version_id', $version->id)->orderBy('id')->get() as $row) {
                $copy = $row->replicate();
                $copy->distribution_version_id = $revision->id;
                $copy->save();
                $rowMap[$row->id] = $copy->id;
            }

            foreach (StudentClinicalAssignment::where('distribution_version_id', $version->id)->orderBy('id')->get() as $assignment) {
                $copy = $assignment->replicate();
                $copy->distribution_version_id = $revision->id;
                $copy->course_schedule_row_id = $assignment->course_schedule_row_id
                    ? ($rowMap[$assignment->course_schedule_row_id] ?? null)
                    : null;
                $copy->save();
            }

            foreach (CourseScheduleCell::where('distribution_version_id', $version->id)->orderBy('id')->get() as $cell) {
                $copy = $cell->replicate();
                $copy->distribution_version_id = $revision->id;
                $copy->course_schedule_row_id = $rowMap[$cell->course_schedule_row_id];
                $copy->save();
            }

            foreach (CourseScheduleBlockActivity::where('distribution_version_id', $version->id)->get() as $activity) {
                $copy = $activity->replicate();
                $copy->distribution_version_id = $revision->id;
                $copy->save();
            }

            AuditLog::create([
                'user_id' => $request->user()->id,
                'action' => 'version.revision_created',
                'entity_type' => DistributionVersion::class,
                'entity_id' => $revision->id,
                'distribution_version_id' => $revision->id,
                'changes' => ['source_version_id' => $version->id],
                'is_override' => false,
            ]);

            return $revision;
        });

        return ApiResponse::success($revision, 'تم إنشاء نسخة قابلة للتعديل مع إبقاء الجدول المنشور فعالاً.');
    }

    public function unpublishSchedule(Request $request, DistributionVersion $version): JsonResponse
    {
        $this->ensureVersionInUserScope($version);
        $data = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:1000']]);

        DB::transaction(function () use ($request, $version, $data) {
            $versions = DistributionVersion::query()
                ->where('rotation_id', $version->rotation_id)
                ->where('status', 'published')
                ->where('is_current', true)
                ->lockForUpdate()
                ->get();

            if (! $versions->contains('id', $version->id)) {
                throw ValidationException::withMessages(['version' => ['هذا الجدول ليس النسخة المنشورة الحالية.']]);
            }

            // Withdraw every current-published row for this rotation. Older data may
            // contain more than one current flag, and leaving one behind makes the
            // schedule appear published even after a successful unpublish request.
            foreach ($versions as $publishedVersion) {
                $publishedVersion->update(['status' => 'withdrawn', 'is_current' => false]);
                AuditLog::create([
                    'user_id' => $request->user()->id,
                    'action' => 'version.unpublished',
                    'entity_type' => DistributionVersion::class,
                    'entity_id' => $publishedVersion->id,
                    'distribution_version_id' => $publishedVersion->id,
                    'changes' => ['status' => ['from' => 'published', 'to' => 'withdrawn']],
                    'is_override' => false,
                    'override_reason' => $data['reason'],
                ]);
            }
        });

        return ApiResponse::success($version->fresh(), 'تم إلغاء نشر الجدول وإخفاؤه عن الطلبة والمشرفين.');
    }

    public function destroySchedule(Request $request, Rotation $rotation): JsonResponse
    {
        $this->ensureAcademicLevelInUserScope($rotation->academic_level);
        if ($rotation->distributionVersions()->where('status', 'published')->where('is_current', true)->exists()) {
            throw ValidationException::withMessages(['rotation' => ['يجب إلغاء نشر الجدول قبل حذفه.']]);
        }

        $data = $request->validate(['reason' => ['nullable', 'string', 'max:1000']]);
        AuditLog::create([
            'user_id' => $request->user()->id,
            'action' => 'course_schedule.deleted',
            'entity_type' => Rotation::class,
            'entity_id' => $rotation->id,
            'changes' => ['name' => $rotation->name, 'course_id' => $rotation->course_id],
            'is_override' => false,
            'override_reason' => $data['reason'] ?? null,
        ]);
        $rotation->delete();

        return ApiResponse::success(null, 'تم حذف الجدول ومسوداته وتوزيعاته التابعة.');
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

    private function validateScheduleRow(Request $request, ?CourseScheduleRow $row = null): array
    {
        $data = $request->validate([
            'row_type' => ['required', 'in:doctor,vacancy'],
            'person_id' => ['nullable', 'integer', 'exists:people,id', 'required_if:row_type,doctor'],
            'training_site_id' => ['required', 'integer', 'exists:training_sites,id'],
            'label' => ['nullable', 'string', 'max:100', 'required_if:row_type,vacancy'],
        ]);

        if (! TrainingSite::query()->active()->whereKey($data['training_site_id'])->exists()) {
            throw ValidationException::withMessages(['training_site_id' => ['المستشفى المحدد غير فعال.']]);
        }

        if ($data['row_type'] === 'doctor') {
            $doctor = Person::active()->findOrFail($data['person_id']);
            if (! $doctor->trainingSites()->whereKey($data['training_site_id'])->exists()
                && $doctor->primary_site_id !== (int) $data['training_site_id']) {
                throw ValidationException::withMessages(['person_id' => ['الطبيب لا يتبع المستشفى المحدد.']]);
            }
            $duplicate = CourseScheduleRow::query()
                ->where('distribution_version_id', $row?->distribution_version_id ?? $request->route('version')->id)
                ->where('person_id', $doctor->id)
                ->where('training_site_id', $data['training_site_id'])
                ->when($row, fn ($query) => $query->whereKeyNot($row->id))
                ->exists();
            if ($duplicate) {
                throw ValidationException::withMessages(['person_id' => ['الطبيب مضاف مسبقاً لهذا المستشفى في الجدول.']]);
            }
            $data['label'] = null;
        } else {
            $data['person_id'] = null;
            $data['label'] = trim($data['label'] ?? '') ?: 'شاغر';
        }

        return $data;
    }

    private function ensureEditableVersion(DistributionVersion $version): void
    {
        if (in_array($version->status, ['published', 'withdrawn'], true)) {
            throw ValidationException::withMessages(['version' => ['أنشئ نسخة تعديل قبل تغيير جدول منشور أو ملغى النشر.']]);
        }
    }

    private function blockExcludesGroup(DistributionVersion $version, RotationBlock $block, string $mainGroupCode): bool
    {
        $activity = CourseScheduleBlockActivity::query()
            ->where('distribution_version_id', $version->id)
            ->where('rotation_block_id', $block->id)
            ->first();
        if (! $activity || $activity->activity_type === 'clinical') {
            return false;
        }

        return $activity->activity_scope === 'all'
            || in_array($mainGroupCode, $activity->main_group_codes ?? [], true);
    }

    private function ensureVersionInUserScope(DistributionVersion $version): void
    {
        $version->loadMissing('rotation');
        abort_unless($version->rotation, 404);
        $this->ensureAcademicLevelInUserScope($version->rotation->academic_level);
    }

    private function ensureAcademicLevelInUserScope(string $academicLevel): void
    {
        $levelScope = $this->getEffectiveAcademicLevelScope();
        abort_if($levelScope !== null && ! in_array($academicLevel, $levelScope, true), 404);
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

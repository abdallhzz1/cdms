<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\V1\StoreStudentRequest;
use App\Http\Requests\V1\UpdateStudentRequest;
use App\Http\Resources\V1\StudentResource;
use App\Http\Responses\ApiResponse;
use App\Models\GroupRegistrationCycle;
use App\Models\Student;
use App\Models\StudentGroup;
use App\Models\StudentGroupRoster;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StudentController extends Controller
{
    use ScopesByDepartmentAndLevel;

    /**
     * GET /api/v1/students
     * Permission: students.view
     *
     * Supports filtering: academic_level, academic_year_id, registration_status,
     * academic_advisor_id, warning_count_min, search (name/number).
     */
    public function index(Request $request): JsonResponse
    {
        $scopedLevels = $this->getUserScopedLevels();

        $query = $this->applyStudentAccessScope(Student::query());

        $students = $query->with(['academicYear', 'academicAdvisor', 'currentGroupAssignments.group', 'groupRegistrationRosters.group'])
            ->when(
                !empty($scopedLevels) && !$request->query('academic_level'),
                fn ($q) => $q->whereIn('academic_level', $scopedLevels)
            )
            ->when(
                $request->query('academic_level'),
                fn ($q, $l) => $q->where('academic_level', $l)
            )
            ->when(
                $request->query('academic_year_id'),
                fn ($q, $y) => $q->where('academic_year_id', $y)
            )
            ->when(
                $request->query('registration_status'),
                fn ($q, $s) => $q->where('registration_status', $s)
            )
            ->when($request->query('academic_registration_status'), fn ($q, $s) => $q->where('academic_registration_status', $s))
            ->when(
                $request->query('academic_advisor_id'),
                function ($q, $advisorParam) {
                    $ids = [(int)$advisorParam];
                    
                    $user = \App\Models\User::find($advisorParam);
                    if ($user) {
                        if ($user->person_id) $ids[] = (int)$user->person_id;
                        $personFromUser = \App\Models\Person::where('user_id', $user->id)->first();
                        if ($personFromUser) $ids[] = (int)$personFromUser->id;
                    }

                    $person = \App\Models\Person::find($advisorParam);
                    if ($person) {
                        $ids[] = (int)$person->id;
                        if ($person->user_id) $ids[] = (int)$person->user_id;
                    }

                    $ids = array_unique(array_filter($ids));
                    $q->whereIn('academic_advisor_id', $ids);
                }
            )
            ->when(
                $request->integer('warning_count_min'),
                fn ($q, $w) => $q->where('warning_count', '>=', $w)
            )
            ->when($request->query('search'), function ($q, $s) {
                $q->where(function ($sub) use ($s) {
                    $sub->where('university_number', 'like', "%{$s}%")
                        ->orWhere('full_name_ar', 'like', "%{$s}%")
                        ->orWhere('full_name_en', 'like', "%{$s}%")
                        ->orWhere('university_email', 'like', "%{$s}%");
                });
            })
            ->orderBy('full_name_ar')
            ->paginate($request->integer('per_page', 25));

        return ApiResponse::success(
            StudentResource::collection($students),
            null,
            [
                'current_page' => $students->currentPage(),
                'last_page'    => $students->lastPage(),
                'total'        => $students->total(),
                'per_page'     => $students->perPage(),
            ]
        );
    }

    /**
     * POST /api/v1/students
     * Permission: students.create
     */
    public function store(StoreStudentRequest $request): JsonResponse
    {
        $student = Student::create($request->validated());

        return ApiResponse::success(
            new StudentResource($student->load('academicYear', 'academicAdvisor')),
            'Student created.',
            [],
            201
        );
    }

    /**
     * GET /api/v1/students/{student}
     * Permission: students.view
     */
    public function show(Student $student): JsonResponse
    {
        $this->authorizeStudentAccess($student);

        return ApiResponse::success(
            new StudentResource(
                $student->load('academicYear', 'academicAdvisor', 'currentGroupAssignments.group', 'currentGroupAssignments.subgroup')
            )
        );
    }

    /**
     * PUT /api/v1/students/{student}
     * Permission: students.update
     */
    public function update(UpdateStudentRequest $request, Student $student): JsonResponse
    {
        $this->authorizeStudentAccess($student);

        $data = $request->validated();

        if (array_key_exists('academic_advisor_id', $data)) {
            $advisorId = $data['academic_advisor_id'];
            if ($advisorId) {
                $student->academic_advisor_id = (int)$advisorId;
            } else {
                $student->academic_advisor_id = null;
            }
            unset($data['academic_advisor_id']);
        }

        $student->update($data);

        return ApiResponse::success(
            new StudentResource($student->fresh()->load('academicYear', 'academicAdvisor')),
            'Student updated successfully.'
        );
    }

    /**
     * POST /api/v1/students/bulk-assign-advisor
     */
    public function bulkAssignAdvisor(Request $request): JsonResponse
    {
        $request->validate([
            'assignments' => 'required|array',
            'assignments.*.student_id' => 'required|integer|exists:students,id',
            'assignments.*.academic_advisor_id' => 'nullable|integer',
        ]);

        $assignments = $request->input('assignments', []);
        
        // Normalize user IDs to the canonical people.id foreign key before
        // beginning the transaction. An unresolved advisor rejects the full batch.
        $grouped = [];
        foreach ($assignments as $item) {
            $advisorId = null;
            if (!empty($item['academic_advisor_id'])) {
                $candidateId = (int) $item['academic_advisor_id'];
                $person = \App\Models\Person::find($candidateId)
                    ?: \App\Models\Person::where('user_id', $candidateId)->first();
                if (!$person) {
                    throw \Illuminate\Validation\ValidationException::withMessages([
                        'assignments' => ["Advisor {$candidateId} does not resolve to a staff profile."],
                    ]);
                }
                $advisorId = $person->id;
            }
            $grouped[$advisorId][] = (int)$item['student_id'];
        }

        \DB::transaction(function () use ($grouped) {
            foreach ($grouped as $advisorId => $studentIds) {
                Student::whereIn('id', $studentIds)
                    ->lockForUpdate()
                    ->update(['academic_advisor_id' => $advisorId ?: null]);
            }
        });

        return ApiResponse::success(null, 'Advisor assignments saved successfully.');
    }

    /**
     * DELETE /api/v1/students/{student}
     * Permission: students.delete
     */
    public function destroy(Student $student): JsonResponse
    {
        $this->authorizeStudentAccess($student);

        $student->delete();

        return ApiResponse::success(
            null,
            'Student deleted successfully.'
        );
    }

    /**
     * POST /api/v1/students/bulk-import
     * Permission: students.create
     */
    public function bulkImport(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'students' => ['required', 'array', 'min:1'],
            'students.*.university_number' => ['required', 'string', 'max:20'],
            'students.*.full_name_ar' => ['required', 'string', 'max:255'],
            'students.*.full_name_en' => ['nullable', 'string', 'max:255'],
            'students.*.national_id' => ['nullable', 'string', 'max:20'],
            'students.*.academic_level' => ['required', 'string', 'max:20'],
            'students.*.main_group_code' => ['nullable', 'string', 'max:2'],
            'students.*.academic_registration_status' => ['nullable', 'in:registered,unregistered'],
            'students.*.gender' => ['nullable', 'in:male,female'],
            'students.*.city' => ['nullable', 'string', 'max:100'],
            'students.*.phone' => ['nullable', 'string', 'max:30'],
            'students.*.university_email' => ['nullable', 'email', 'max:255'],
            'students.*.batch_year' => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'students.*.registration_status' => ['nullable', 'in:active,suspended,on_leave,transferred,graduated,repeating,deferred,delayed'],
            'students.*.gpa' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'students.*.warning_count' => ['nullable', 'integer', 'min:0', 'max:10'],
            'group_registration_cycle_id' => ['nullable', 'integer', 'exists:group_registration_cycles,id'],
        ]);

        $normalizeLevel = static function (mixed $value): string {
            $level = strtolower(trim((string) $value));
            if (in_array($level, ['fourth', 'fifth', 'sixth'], true)) return $level;
            if (str_contains($level, '4') || str_contains($level, 'رابع')) return 'fourth';
            if (str_contains($level, '5') || str_contains($level, 'خامس')) return 'fifth';
            if (str_contains($level, '6') || str_contains($level, 'سادس') || str_contains($level, 'امتياز')) return 'sixth';
            return '';
        };

        $cycle = ! empty($validated['group_registration_cycle_id'])
            ? GroupRegistrationCycle::findOrFail($validated['group_registration_cycle_id'])
            : null;
        $groups = collect();

        if ($cycle) {
            if ($cycle->status === 'archived') {
                throw ValidationException::withMessages([
                    'group_registration_cycle_id' => ['لا يمكن استيراد قائمة إلى دورة مؤرشفة.'],
                ]);
            }

            $groups = StudentGroup::query()
                ->where('academic_year_id', $cycle->academic_year_id)
                ->where('academic_level', $cycle->academic_level)
                ->where('group_type', 'self_registration')
                ->get()
                ->keyBy(fn (StudentGroup $group) => strtoupper($group->name));

            $rosterErrors = [];
            foreach ($validated['students'] as $index => $row) {
                $groupCode = strtoupper(trim((string) ($row['main_group_code'] ?? '')));
                if ($normalizeLevel($row['academic_level']) !== $cycle->academic_level) {
                    $rosterErrors["students.$index.academic_level"][] = 'السنة السريرية لا تطابق دورة التسجيل المختارة.';
                }
                if ($groupCode === '') {
                    $rosterErrors["students.$index.main_group_code"][] = 'المجموعة الرئيسية مطلوبة عند ربط القائمة بدورة تسجيل.';
                } elseif (! $groups->has($groupCode)) {
                    $rosterErrors["students.$index.main_group_code"][] = 'المجموعة الرئيسية غير موجودة في دورة التسجيل المختارة.';
                }
            }
            if ($rosterErrors) throw ValidationException::withMessages($rosterErrors);
        }

        $imported = 0;
        $updated = 0;
        $rostered = 0;

        DB::transaction(function () use ($validated, $cycle, $groups, $normalizeLevel, &$imported, &$updated, &$rostered) {
            foreach ($validated['students'] as $row) {
                $univNumber = trim((string)$row['university_number']);
                $level = $normalizeLevel($row['academic_level']) ?: 'fourth';

                $data = [
                    'full_name_ar'        => trim((string)$row['full_name_ar']),
                    'full_name_en'        => !empty($row['full_name_en']) ? trim((string)$row['full_name_en']) : null,
                    'national_id'         => !empty($row['national_id']) ? trim((string)$row['national_id']) : null,
                    'gender'              => in_array(strtolower((string)($row['gender'] ?? '')), ['male', 'female']) ? strtolower((string)$row['gender']) : (str_contains((string)($row['gender'] ?? ''), 'أنثى') ? 'female' : 'male'),
                    'city'                => !empty($row['city']) ? trim((string)$row['city']) : 'الخليل',
                    'phone'               => !empty($row['phone']) ? trim((string)$row['phone']) : null,
                    'university_email'    => !empty($row['university_email']) ? trim((string)$row['university_email']) : "{$univNumber}@students.hebron.edu",
                    'batch_year'          => !empty($row['batch_year']) ? (int)$row['batch_year'] : date('Y') - 3,
                    'academic_level'      => $level,
                    'registration_status' => !empty($row['registration_status']) ? strtolower((string)$row['registration_status']) : 'active',
                    'academic_registration_status' => in_array(strtolower((string)($row['academic_registration_status'] ?? 'registered')), ['registered', 'unregistered'], true)
                        ? strtolower((string)($row['academic_registration_status'] ?? 'registered')) : 'registered',
                ];

                if (isset($row['gpa']) && $row['gpa'] !== '' && $row['gpa'] !== null) {
                    $data['gpa'] = (float)$row['gpa'];
                }
                if (isset($row['warning_count']) && $row['warning_count'] !== '' && $row['warning_count'] !== null) {
                    $data['warning_count'] = (int)$row['warning_count'];
                }
                if ($cycle) {
                    $data['academic_year_id'] = $cycle->academic_year_id;
                }

                $student = Student::where('university_number', $univNumber)->first();
                if ($student) {
                    $student->update($data);
                    $updated++;
                } else {
                    $data['university_number'] = $univNumber;
                    Student::create($data);
                    $imported++;
                }

                if ($cycle) {
                    $student = Student::where('university_number', $univNumber)->firstOrFail();
                    $groupCode = strtoupper(trim((string) $row['main_group_code']));
                    StudentGroupRoster::updateOrCreate(
                        ['group_registration_cycle_id' => $cycle->id, 'student_id' => $student->id],
                        ['student_group_id' => $groups->get($groupCode)->id],
                    );
                    $rostered++;
                }
            }
        });

        return ApiResponse::success([
            'imported' => $imported,
            'updated'  => $updated,
            'rostered' => $rostered,
            'errors'   => [],
        ], "تمت معالجة " . ($imported + $updated) . " طالب بنجاح.");
    }
}

<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\V1\StoreStudentRequest;
use App\Http\Requests\V1\UpdateStudentRequest;
use App\Http\Resources\V1\StudentResource;
use App\Http\Responses\ApiResponse;
use App\Models\Student;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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

        $students = Student::with(['academicYear', 'academicAdvisor', 'currentGroupAssignments.group'])
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
        
        // Group by advisor_id for instant SQL batch updates
        $grouped = [];
        foreach ($assignments as $item) {
            $advisorId = $item['academic_advisor_id'] ? (int)$item['academic_advisor_id'] : null;
            $grouped[$advisorId][] = (int)$item['student_id'];
        }

        foreach ($grouped as $advisorId => $studentIds) {
            Student::whereIn('id', $studentIds)->update(['academic_advisor_id' => $advisorId]);
        }

        return ApiResponse::success(null, 'Advisor assignments saved successfully.');
    }

    /**
     * DELETE /api/v1/students/{student}
     * Permission: students.delete
     */
    public function destroy(Student $student): JsonResponse
    {
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
        $request->validate([
            'students' => ['required', 'array', 'min:1'],
            'students.*.university_number' => ['required', 'string'],
            'students.*.full_name_ar' => ['required', 'string'],
            'students.*.academic_level' => ['required', 'string'],
        ]);

        $imported = 0;
        $updated = 0;
        $errors = [];

        foreach ($request->input('students') as $index => $row) {
            try {
                $univNumber = trim((string)$row['university_number']);
                $level = strtolower(trim((string)$row['academic_level']));
                if (!in_array($level, ['fourth', 'fifth', 'sixth'])) {
                    if (str_contains($level, '4') || str_contains($level, 'رابع')) $level = 'fourth';
                    elseif (str_contains($level, '5') || str_contains($level, 'خامس')) $level = 'fifth';
                    elseif (str_contains($level, '6') || str_contains($level, 'سادس') || str_contains($level, 'امتياز')) $level = 'sixth';
                    else $level = 'fourth';
                }

                $data = [
                    'full_name_ar'        => trim((string)$row['full_name_ar']),
                    'full_name_en'        => !empty($row['full_name_en']) ? trim((string)$row['full_name_en']) : null,
                    'national_id'         => !empty($row['national_id']) ? trim((string)$row['national_id']) : null,
                    'gender'              => in_array(strtolower((string)($row['gender'] ?? '')), ['male', 'female']) ? strtolower((string)$row['gender']) : (str_contains((string)($row['gender'] ?? ''), 'أنثى') ? 'female' : 'male'),
                    'city'                => !empty($row['city']) ? trim((string)$row['city']) : 'الخليل',
                    'phone'               => !empty($row['phone']) ? trim((string)$row['phone']) : null,
                    'university_email'    => !empty($row['university_email']) ? trim((string)$row['university_email']) : "{$univNumber}@hebron.edu",
                    'batch_year'          => !empty($row['batch_year']) ? (int)$row['batch_year'] : date('Y') - 3,
                    'academic_level'      => $level,
                    'registration_status' => !empty($row['registration_status']) ? strtolower((string)$row['registration_status']) : 'active',
                ];

                if (isset($row['gpa']) && $row['gpa'] !== '' && $row['gpa'] !== null) {
                    $data['gpa'] = (float)$row['gpa'];
                }
                if (isset($row['warning_count']) && $row['warning_count'] !== '' && $row['warning_count'] !== null) {
                    $data['warning_count'] = (int)$row['warning_count'];
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
            } catch (\Throwable $e) {
                $errors[] = "Row " . ($index + 1) . ": " . $e->getMessage();
            }
        }

        return ApiResponse::success([
            'imported' => $imported,
            'updated'  => $updated,
            'errors'   => $errors,
        ], "تمت معالجة " . ($imported + $updated) . " طالب بنجاح.");
    }
}

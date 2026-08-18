<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\V1\StoreStudentRequest;
use App\Http\Requests\V1\UpdateStudentRequest;
use App\Http\Resources\V1\StudentResource;
use App\Http\Responses\ApiResponse;
use App\Models\Student;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudentController extends Controller
{
    /**
     * GET /api/v1/students
     * Permission: students.view
     *
     * Supports filtering: academic_level, academic_year_id, registration_status,
     * academic_advisor_id, warning_count_min, search (name/number).
     */
    public function index(Request $request): JsonResponse
    {
        $students = Student::with(['academicYear', 'academicAdvisor', 'currentGroupAssignments.group'])
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
                fn ($q, $a) => $q->where('academic_advisor_id', $a)
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
        $student->update($request->validated());

        return ApiResponse::success(
            new StudentResource($student->fresh()->load('academicYear', 'academicAdvisor')),
            'Student updated successfully.'
        );
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

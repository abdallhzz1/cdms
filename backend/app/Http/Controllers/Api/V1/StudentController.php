<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\V1\StoreStudentRequest;
use App\Http\Requests\V1\UpdateStudentRequest;
use App\Http\Resources\V1\StudentResource;
use App\Http\Responses\ApiResponse;
use App\Models\AdvisingRecord;
use App\Models\AttendanceRecord;
use App\Models\AuditLog;
use App\Models\ClinicalAssessment;
use App\Models\GroupRegistrationCycle;
use App\Models\Person;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentCourseEnrollment;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentGroupRoster;
use App\Models\User;
use App\Services\SecureFileUploadService;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class StudentController extends Controller
{
    use ScopesByDepartmentAndLevel;

    /**
     * Return the main-group values actually assigned to visible students.
     * The selected cohort is applied so each batch gets its own dynamic list.
     */
    public function mainGroups(Request $request): JsonResponse
    {
        $scopedLevels = $this->getUserScopedLevels();
        $visibleStudents = $this->applyStudentAccessScope(Student::query())
            ->when(
                ! empty($scopedLevels) && ! $request->query('academic_level'),
                fn ($query) => $query->whereIn('academic_level', $scopedLevels)
            )
            ->when(
                $request->query('academic_level'),
                fn ($query, $level) => $query->where('academic_level', $level)
            )
            ->select('students.id');

        $groups = StudentGroupRoster::query()
            ->join('student_groups', 'student_groups.id', '=', 'student_group_rosters.student_group_id')
            ->whereIn('student_group_rosters.student_id', $visibleStudents)
            ->whereRaw('student_group_rosters.group_registration_cycle_id = (
                SELECT MAX(latest_roster.group_registration_cycle_id)
                FROM student_group_rosters AS latest_roster
                WHERE latest_roster.student_id = student_group_rosters.student_id
            )')
            ->whereNotNull('student_groups.name')
            ->where('student_groups.name', '!=', '')
            ->distinct()
            ->orderBy('student_groups.name')
            ->pluck('student_groups.name')
            ->values();

        return ApiResponse::success($groups);
    }

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
                ! empty($scopedLevels) && ! $request->query('academic_level'),
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
            ->when($request->query('main_group_code'), function ($q, $groupCode) {
                $normalized = strtoupper(trim((string) $groupCode));
                $q->whereHas('groupRegistrationRosters.group', fn ($group) => $group->whereRaw('UPPER(name) = ?', [$normalized])
                );
            })
            ->when(
                $request->query('registration_status'),
                fn ($q, $s) => $q->where('registration_status', $s)
            )
            ->when($request->query('academic_registration_status'), fn ($q, $s) => $q->where('academic_registration_status', $s))
            ->when(
                $request->query('academic_advisor_id'),
                function ($q, $advisorParam) {
                    $ids = [(int) $advisorParam];

                    $user = User::find($advisorParam);
                    if ($user) {
                        if ($user->person_id) {
                            $ids[] = (int) $user->person_id;
                        }
                        $personFromUser = Person::where('user_id', $user->id)->first();
                        if ($personFromUser) {
                            $ids[] = (int) $personFromUser->id;
                        }
                    }

                    $person = Person::find($advisorParam);
                    if ($person) {
                        $ids[] = (int) $person->id;
                        if ($person->user_id) {
                            $ids[] = (int) $person->user_id;
                        }
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
                'last_page' => $students->lastPage(),
                'total' => $students->total(),
                'per_page' => $students->perPage(),
            ]
        );
    }

    /**
     * POST /api/v1/students
     * Permission: students.create
     */
    public function store(StoreStudentRequest $request): JsonResponse
    {
        $data = $request->validated();
        $cycleId = $data['group_registration_cycle_id'] ?? null;
        $mainGroupCode = $data['main_group_code'] ?? null;
        unset($data['group_registration_cycle_id'], $data['main_group_code']);

        $student = DB::transaction(function () use ($data, $cycleId, $mainGroupCode) {
            $student = Student::create($data);
            $this->syncRegistrationRoster($student, $cycleId, $mainGroupCode);

            return $student;
        });

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
                $student->load(
                    'academicYear',
                    'academicAdvisor',
                    'currentGroupAssignments.group',
                    'currentGroupAssignments.subgroup',
                    'groupRegistrationRosters.group',
                )
            )
        );
    }

    public function uploadPhoto(Request $request, Student $student, SecureFileUploadService $files): JsonResponse
    {
        $this->authorizeStudentAccess($student);
        $request->validate([
            'photo' => ['required_without:photo_base64', 'nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            'photo_base64' => ['required_without:photo', 'nullable', 'string'],
        ]);

        $source = $request->file('photo') ?: (string) $request->input('photo_base64');
        $stored = $files->storeAvatar($source, 'student-profile-photos/'.$student->id);
        $oldPath = $student->photo_storage_path;

        $student->update([
            'photo_url' => $stored['url'],
            'photo_storage_path' => $stored['path'],
        ]);
        if ($oldPath && $oldPath !== $stored['path']) {
            Storage::disk('public')->delete($oldPath);
        }

        return ApiResponse::success(
            new StudentResource($student->fresh()->load('academicYear', 'academicAdvisor')),
            'Student photo updated.'
        );
    }

    public function uploadDocument(Request $request, Student $student, SecureFileUploadService $files): JsonResponse
    {
        $this->authorizeStudentAccess($student);
        $data = $request->validate([
            'title' => ['required', 'string', 'max:150'],
            'category' => ['required', 'in:clinical_pledge,insurance,medical_report,other'],
            'file' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png,webp,doc,docx,xls,xlsx', 'max:10240'],
        ]);

        $stored = $files->storeDocument($request->file('file'), 'student-documents/'.$student->id);
        $documentId = (string) Str::uuid();
        $document = [
            'id' => $documentId,
            'title' => trim($data['title']),
            'category' => $data['category'],
            'file_name' => $request->file('file')->getClientOriginalName(),
            'mime_type' => $stored['mime_type'],
            'file_type' => $stored['file_type'],
            'size_bytes' => $stored['size_bytes'],
            'storage_path' => $stored['storage_path'],
            'uploaded_at' => now()->toIso8601String(),
            'uploaded_by' => $request->user()?->name,
        ];

        $documents = is_array($student->documents) ? $student->documents : [];
        array_unshift($documents, $document);
        $student->update(['documents' => $documents]);
        unset($document['storage_path']);
        $document['download_url'] = url("/api/v1/students/{$student->id}/documents/{$documentId}");

        return ApiResponse::success($document, 'Student document uploaded.', [], 201);
    }

    public function downloadDocument(Student $student, string $documentId)
    {
        $this->authorizeStudentAccess($student);
        $document = collect($student->documents ?: [])->first(
            fn ($item) => (string) ($item['id'] ?? '') === $documentId
        );
        abort_unless($document && ! empty($document['storage_path']) && Storage::disk('local')->exists($document['storage_path']), 404);

        $safeTitle = preg_replace('/[^\pL\pN._-]+/u', '_', (string) ($document['title'] ?? 'student-document'));

        return Storage::disk('local')->download(
            $document['storage_path'],
            $safeTitle.'.'.($document['file_type'] ?? 'bin'),
            ['Content-Type' => $document['mime_type'] ?? 'application/octet-stream', 'X-Content-Type-Options' => 'nosniff']
        );
    }

    public function deleteDocument(Request $request, Student $student, string $documentId): JsonResponse
    {
        $this->authorizeStudentAccess($student);
        $documents = collect($student->documents ?: []);
        $document = $documents->first(fn ($item) => (string) ($item['id'] ?? '') === $documentId);
        abort_unless($document, 404);

        if (! empty($document['storage_path'])) {
            Storage::disk('local')->delete($document['storage_path']);
        }
        $student->update([
            'documents' => $documents
                ->reject(fn ($item) => (string) ($item['id'] ?? '') === $documentId)
                ->values()
                ->all(),
        ]);

        return ApiResponse::success(null, 'Student document deleted.');
    }

    /**
     * PUT /api/v1/students/{student}
     * Permission: students.update
     */
    public function update(UpdateStudentRequest $request, Student $student): JsonResponse
    {
        $this->authorizeStudentAccess($student);

        $data = $request->validated();
        $shouldSyncRoster = $request->exists('group_registration_cycle_id')
            || $request->exists('main_group_code');
        $cycleId = $data['group_registration_cycle_id'] ?? null;
        $mainGroupCode = $data['main_group_code'] ?? null;
        unset($data['group_registration_cycle_id'], $data['main_group_code']);

        if (array_key_exists('academic_advisor_id', $data)) {
            $advisorId = $data['academic_advisor_id'];
            if ($advisorId) {
                $student->academic_advisor_id = (int) $advisorId;
            } else {
                $student->academic_advisor_id = null;
            }
            unset($data['academic_advisor_id']);
        }

        DB::transaction(function () use ($student, $data, $cycleId, $mainGroupCode, $shouldSyncRoster) {
            $student->update($data);
            if ($shouldSyncRoster) {
                $this->syncRegistrationRoster($student, $cycleId, $mainGroupCode, true);
            }
        });

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

        $requestedStudentIds = collect($assignments)
            ->pluck('student_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
        $accessibleCount = $this->applyStudentAccessScope(Student::query())
            ->whereIn('id', $requestedStudentIds)
            ->count();

        if ($accessibleCount !== $requestedStudentIds->count()) {
            throw ValidationException::withMessages([
                'assignments' => ['One or more students are outside your advising scope.'],
            ]);
        }

        // Normalize user IDs to the canonical people.id foreign key before
        // beginning the transaction. An unresolved advisor rejects the full batch.
        $grouped = [];
        foreach ($assignments as $item) {
            $advisorId = null;
            if (! empty($item['academic_advisor_id'])) {
                $candidateId = (int) $item['academic_advisor_id'];
                $advisorUser = User::with('roles')->find($candidateId);
                if ($advisorUser && ! $advisorUser->roles->contains('code', 'ACADEMIC_ADVISOR')) {
                    throw ValidationException::withMessages([
                        'assignments' => ["User {$candidateId} is not an academic advisor."],
                    ]);
                }

                $person = $advisorUser
                    ? Person::firstOrCreate(
                        ['user_id' => $advisorUser->id],
                        [
                            'full_name_ar' => $advisorUser->name,
                            'full_name_en' => $advisorUser->name,
                            'email' => $advisorUser->email,
                            'is_active' => true,
                        ],
                    )
                    : Person::with('user.roles')->find($candidateId);

                if ($person && (! $person->user || ! $person->user->roles->contains('code', 'ACADEMIC_ADVISOR'))) {
                    $person = null;
                }
                if (! $person) {
                    throw ValidationException::withMessages([
                        'assignments' => ["Advisor {$candidateId} is unavailable or does not hold the academic-advisor role."],
                    ]);
                }
                $advisorId = $person->id;
            }
            $grouped[$advisorId][] = (int) $item['student_id'];
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
    public function destroy(Request $request, Student $student): JsonResponse
    {
        $this->authorizeStudentAccess($student);

        $force = $request->boolean('force');
        $deletedCounts = DB::transaction(function () use ($request, $student, $force): array {
            $lockedStudent = Student::query()->lockForUpdate()->findOrFail($student->id);

            // Registration rosters and subgroup selections are operational setup
            // records and may be cleaned when an administrator explicitly deletes
            // a student. Academic and clinical evidence must never be erased as a
            // side effect of deleting a directory entry.
            $protectedRecords = collect([
                'توزيعات سريرية منشورة أو محفوظة' => StudentClinicalAssignment::where('student_id', $lockedStudent->id)->exists(),
                'تسجيلات مساقات أو علامات' => StudentCourseEnrollment::where('student_id', $lockedStudent->id)->exists(),
                'سجلات حضور وغياب' => AttendanceRecord::where('student_id', $lockedStudent->id)->exists(),
                'تقييمات سريرية' => ClinicalAssessment::where('student_id', $lockedStudent->id)->exists(),
                'سجلات إرشاد أكاديمي' => AdvisingRecord::where('student_id', $lockedStudent->id)->exists(),
            ])->filter()->keys()->values();

            if ($protectedRecords->isNotEmpty() && ! $force) {
                throw ValidationException::withMessages([
                    'student' => [
                        'لا يمكن حذف الطالب لأن سجله مرتبط بـ: '
                        .$protectedRecords->implode('، ')
                        .'. احتفظ بسجل الطالب وغيّر حالته الأكاديمية بدلاً من حذفه.',
                    ],
                    'force_delete' => ['available'],
                ]);
            }

            if ($force) {
                $confirmation = trim((string) $request->input('confirmation'));
                $reason = trim((string) $request->input('reason'));
                $errors = [];
                if ($confirmation !== $lockedStudent->university_number) {
                    $errors['confirmation'][] = 'اكتب الرقم الجامعي للطالب حرفياً لتأكيد الحذف النهائي.';
                }
                if (mb_strlen($reason) < 5) {
                    $errors['reason'][] = 'سبب الحذف النهائي مطلوب ويجب ألا يقل عن 5 أحرف.';
                }
                if ($errors) {
                    throw ValidationException::withMessages($errors);
                }

                $enrollmentIds = StudentCourseEnrollment::where('student_id', $lockedStudent->id)->pluck('id');
                $advisingRecordIds = AdvisingRecord::where('student_id', $lockedStudent->id)->pluck('id');
                $deleted = [
                    'grade_entries' => DB::table('grade_entries')->whereIn('student_course_enrollment_id', $enrollmentIds)->delete(),
                    'student_course_enrollments' => StudentCourseEnrollment::where('student_id', $lockedStudent->id)->delete(),
                    'attendance_records' => AttendanceRecord::where('student_id', $lockedStudent->id)->delete(),
                    'clinical_assessments' => ClinicalAssessment::where('student_id', $lockedStudent->id)->delete(),
                    'advising_participants' => DB::table('advising_participants')->where(function ($query) use ($lockedStudent, $advisingRecordIds) {
                        $query->where('student_id', $lockedStudent->id)
                            ->orWhereIn('advising_record_id', $advisingRecordIds);
                    })->delete(),
                    'advising_records' => AdvisingRecord::where('student_id', $lockedStudent->id)->delete(),
                    'external_electives' => DB::table('external_electives')->where('student_id', $lockedStudent->id)->delete(),
                    'distribution_conflicts' => DB::table('distribution_conflicts')->where('student_id', $lockedStudent->id)->delete(),
                    'student_clinical_assignments' => StudentClinicalAssignment::where('student_id', $lockedStudent->id)->delete(),
                    'student_group_rosters' => StudentGroupRoster::where('student_id', $lockedStudent->id)->delete(),
                    'student_group_assignments' => StudentGroupAssignment::where('student_id', $lockedStudent->id)->delete(),
                    'group_registration_otp_challenges' => DB::table('group_registration_otp_challenges')->where('student_id', $lockedStudent->id)->delete(),
                    'student_schedule_otp_challenges' => DB::table('student_schedule_otp_challenges')->where('student_id', $lockedStudent->id)->delete(),
                ];

                $studentId = $lockedStudent->id;
                $universityNumber = $lockedStudent->university_number;
                $lockedStudent->delete();
                AuditLog::create([
                    'user_id' => $request->user()?->id,
                    'action' => 'student.force_deleted',
                    'entity_type' => 'student',
                    'entity_id' => $studentId,
                    'changes' => [
                        'university_number' => $universityNumber,
                        'reason' => $reason,
                        'deleted_records' => $deleted,
                    ],
                    'is_override' => true,
                    'override_reason' => $reason,
                ]);

                return $deleted;
            }

            StudentGroupRoster::where('student_id', $lockedStudent->id)->delete();
            StudentGroupAssignment::where('student_id', $lockedStudent->id)->delete();
            $lockedStudent->delete();

            return [];
        });

        return ApiResponse::success(
            $force ? ['deleted_records' => $deletedCounts] : null,
            $force
                ? 'تم حذف الطالب نهائياً مع جميع بياناته المرتبطة.'
                : 'تم حذف الطالب وتنظيف روابط تسجيل المجموعات التابعة له بنجاح.'
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
            if (in_array($level, ['fourth', 'fifth', 'sixth'], true)) {
                return $level;
            }
            if (str_contains($level, '4') || str_contains($level, 'رابع')) {
                return 'fourth';
            }
            if (str_contains($level, '5') || str_contains($level, 'خامس')) {
                return 'fifth';
            }
            if (str_contains($level, '6') || str_contains($level, 'سادس') || str_contains($level, 'امتياز')) {
                return 'sixth';
            }

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
            if ($rosterErrors) {
                throw ValidationException::withMessages($rosterErrors);
            }
        }

        $imported = 0;
        $updated = 0;
        $rostered = 0;

        DB::transaction(function () use ($validated, $cycle, $groups, $normalizeLevel, &$imported, &$updated, &$rostered) {
            foreach ($validated['students'] as $row) {
                $univNumber = trim((string) $row['university_number']);
                $level = $normalizeLevel($row['academic_level']) ?: 'fourth';

                $data = [
                    'full_name_ar' => trim((string) $row['full_name_ar']),
                    'full_name_en' => ! empty($row['full_name_en']) ? trim((string) $row['full_name_en']) : null,
                    'national_id' => ! empty($row['national_id']) ? trim((string) $row['national_id']) : null,
                    'gender' => in_array(strtolower((string) ($row['gender'] ?? '')), ['male', 'female']) ? strtolower((string) $row['gender']) : (str_contains((string) ($row['gender'] ?? ''), 'أنثى') ? 'female' : 'male'),
                    'city' => ! empty($row['city']) ? trim((string) $row['city']) : 'الخليل',
                    'phone' => ! empty($row['phone']) ? trim((string) $row['phone']) : null,
                    'university_email' => ! empty($row['university_email']) ? trim((string) $row['university_email']) : "{$univNumber}@students.hebron.edu",
                    'batch_year' => ! empty($row['batch_year']) ? (int) $row['batch_year'] : date('Y') - 3,
                    'academic_level' => $level,
                    'registration_status' => ! empty($row['registration_status']) ? strtolower((string) $row['registration_status']) : 'active',
                    'academic_registration_status' => in_array(strtolower((string) ($row['academic_registration_status'] ?? 'registered')), ['registered', 'unregistered'], true)
                        ? strtolower((string) ($row['academic_registration_status'] ?? 'registered')) : 'registered',
                ];

                if (isset($row['gpa']) && $row['gpa'] !== '' && $row['gpa'] !== null) {
                    $data['gpa'] = (float) $row['gpa'];
                }
                if (isset($row['warning_count']) && $row['warning_count'] !== '' && $row['warning_count'] !== null) {
                    $data['warning_count'] = (int) $row['warning_count'];
                }
                if ($cycle) {
                    $data['academic_year_id'] = $cycle->academic_year_id;
                }

                $student = Student::where('university_number', $univNumber)->first();
                if ($student) {
                    $student->update($data);
                    $this->detachMismatchedRegistrationRosters($student->fresh());
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
            'updated' => $updated,
            'rostered' => $rostered,
            'errors' => [],
        ], 'تمت معالجة '.($imported + $updated).' طالب بنجاح.');
    }

    private function syncRegistrationRoster(
        Student $student,
        mixed $cycleId,
        mixed $mainGroupCode,
        bool $detachWhenEmpty = false,
    ): void {
        if (! $cycleId) {
            if ($detachWhenEmpty) {
                $this->detachRegistrationRosters($student);
            }

            return;
        }

        $cycle = GroupRegistrationCycle::findOrFail((int) $cycleId);
        if ($cycle->status === 'archived') {
            throw ValidationException::withMessages(['group_registration_cycle_id' => ['لا يمكن ربط الطالب بدورة مؤرشفة.']]);
        }
        if ($student->academic_level !== $cycle->academic_level) {
            throw ValidationException::withMessages(['group_registration_cycle_id' => ['السنة السريرية للطالب لا تطابق دورة التسجيل المختارة.']]);
        }

        $group = StudentGroup::query()
            ->where('academic_year_id', $cycle->academic_year_id)
            ->where('academic_level', $cycle->academic_level)
            ->where('group_type', 'self_registration')
            ->whereRaw('UPPER(name) = ?', [strtoupper(trim((string) $mainGroupCode))])
            ->first();

        if (! $group) {
            throw ValidationException::withMessages(['main_group_code' => ['المجموعة الرئيسية غير موجودة في دورة التسجيل المختارة.']]);
        }

        $existingRosters = StudentGroupRoster::query()
            ->with('cycle')
            ->where('student_id', $student->id)
            ->get();
        $changedRosters = $existingRosters->filter(fn (StudentGroupRoster $roster) => (int) $roster->group_registration_cycle_id !== (int) $cycle->id
            || (int) $roster->student_group_id !== (int) $group->id
        );
        $affectedAcademicYearIds = $changedRosters
            ->pluck('cycle.academic_year_id')
            ->filter()
            ->unique()
            ->values();

        if ($affectedAcademicYearIds->isNotEmpty()) {
            StudentGroupAssignment::query()
                ->where('student_id', $student->id)
                ->whereIn('academic_year_id', $affectedAcademicYearIds)
                ->delete();
        }

        StudentGroupRoster::query()
            ->where('student_id', $student->id)
            ->where('group_registration_cycle_id', '!=', $cycle->id)
            ->delete();

        $student->update(['academic_year_id' => $cycle->academic_year_id]);
        StudentGroupRoster::updateOrCreate(
            ['group_registration_cycle_id' => $cycle->id, 'student_id' => $student->id],
            ['student_group_id' => $group->id],
        );
    }

    private function detachRegistrationRosters(Student $student): void
    {
        $academicYearIds = StudentGroupRoster::query()
            ->with('cycle')
            ->where('student_id', $student->id)
            ->get()
            ->pluck('cycle.academic_year_id')
            ->filter()
            ->unique()
            ->values();

        if ($academicYearIds->isNotEmpty()) {
            StudentGroupAssignment::query()
                ->where('student_id', $student->id)
                ->whereIn('academic_year_id', $academicYearIds)
                ->delete();
        }

        StudentGroupRoster::where('student_id', $student->id)->delete();
    }

    private function detachMismatchedRegistrationRosters(Student $student): void
    {
        $mismatchedRosters = StudentGroupRoster::query()
            ->with('cycle')
            ->where('student_id', $student->id)
            ->whereHas('cycle', fn ($query) => $query->where('academic_level', '!=', $student->academic_level))
            ->get();

        $academicYearIds = $mismatchedRosters
            ->pluck('cycle.academic_year_id')
            ->filter()
            ->unique()
            ->values();

        if ($academicYearIds->isNotEmpty()) {
            StudentGroupAssignment::query()
                ->where('student_id', $student->id)
                ->whereIn('academic_year_id', $academicYearIds)
                ->delete();
        }

        StudentGroupRoster::whereIn('id', $mismatchedRosters->pluck('id'))->delete();
    }
}

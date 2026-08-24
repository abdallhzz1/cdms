<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\HealthController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes — v1
|--------------------------------------------------------------------------
| Every CDMS endpoint lives under /api/v1/... (ARCHITECTURE.md: "REST API
| versioned as needed"). Phase 2 adds only the auth/authz foundation
| (login/logout/me); business routes (students, grades, distribution, ...)
| are added module-by-module in later phases per PROJECT_RULES.md's
| one-module-per-cycle rule — do not add placeholder routes for them here
| ahead of time.
*/
Route::prefix('v1')->name('api.v1.')->group(function () {
    Route::get('/health', HealthController::class)->name('health');

    Route::prefix('auth')->name('auth.')->group(function () {
        // Public: rate-limited so credential-stuffing can't be automated
        // against it (Prompt 02 §16).
        Route::post('/login', [AuthController::class, 'login'])
            ->middleware('throttle:login')
            ->name('login');

        // Protected: auth:sanctum authenticates via the first-party session
        // cookie (statefulApi(), bootstrap/app.php) — no bearer token.
        Route::middleware('auth:sanctum')->group(function () {
            Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
            Route::get('/me', [AuthController::class, 'me'])->name('me');
        });
    });

    // -------------------------------------------------------------------------
    // Public Routes (No authentication required — for lobby displays & student self-lookup)
    // -------------------------------------------------------------------------
    Route::prefix('public')->name('public.')->group(function () {
        Route::get('clinical-schedule', [\App\Http\Controllers\Api\V1\OperationalDistributionController::class, 'publicSchedule'])
            ->middleware('throttle:operational-read')
            ->name('clinical-schedule');
        Route::get('group-registration/{cycle:public_id}', [\App\Http\Controllers\Api\V1\PublicGroupRegistrationController::class, 'cycle']);
        Route::post('group-registration/{cycle:public_id}/request-otp', [\App\Http\Controllers\Api\V1\PublicGroupRegistrationController::class, 'requestOtp'])->middleware('throttle:student-otp-request');
        Route::post('group-registration/{cycle:public_id}/verify-otp', [\App\Http\Controllers\Api\V1\PublicGroupRegistrationController::class, 'verifyOtp'])->middleware('throttle:student-otp-verify');
        Route::post('group-registration/{cycle:public_id}/options', [\App\Http\Controllers\Api\V1\PublicGroupRegistrationController::class, 'options'])->middleware('throttle:operational-read');
        Route::post('group-registration/{cycle:public_id}/select', [\App\Http\Controllers\Api\V1\PublicGroupRegistrationController::class, 'select'])->middleware('throttle:operational-read');
        Route::post('group-registration/{cycle:public_id}/withdraw', [\App\Http\Controllers\Api\V1\PublicGroupRegistrationController::class, 'withdraw'])->middleware('throttle:operational-read');
    });

    // -------------------------------------------------------------------------
    // Phase 3A — Core Domain & People Foundation
    // All routes: auth:sanctum (authentication) + permission:<code> (authorization)
    // -------------------------------------------------------------------------
    Route::middleware('auth:sanctum')->group(function () {

        Route::prefix('group-registration-cycles')->group(function () {
            Route::get('/', [\App\Http\Controllers\Api\V1\GroupRegistrationAdminController::class, 'index'])->middleware('permission:group_registration.view');
            Route::post('/', [\App\Http\Controllers\Api\V1\GroupRegistrationAdminController::class, 'store'])->middleware('permission:group_registration.manage_groups');
            Route::get('/{cycle}', [\App\Http\Controllers\Api\V1\GroupRegistrationAdminController::class, 'show'])->middleware('permission:group_registration.view');
            Route::put('/{cycle}', [\App\Http\Controllers\Api\V1\GroupRegistrationAdminController::class, 'update'])->middleware('permission:group_registration.open_close');
            Route::post('/{cycle}/roster', [\App\Http\Controllers\Api\V1\GroupRegistrationAdminController::class, 'importRoster'])->middleware('permission:group_registration.manage_roster');
            Route::post('/{cycle}/groups/{group}/subgroups', [\App\Http\Controllers\Api\V1\GroupRegistrationAdminController::class, 'storeSubgroup'])->middleware('permission:group_registration.manage_groups');
            Route::put('/{cycle}/subgroups/{subgroup}', [\App\Http\Controllers\Api\V1\GroupRegistrationAdminController::class, 'updateSubgroup'])->middleware('permission:group_registration.manage_groups');
            Route::delete('/{cycle}/subgroups/{subgroup}', [\App\Http\Controllers\Api\V1\GroupRegistrationAdminController::class, 'archiveSubgroup'])->middleware('permission:group_registration.manage_groups');
        });

        // Academic Years
        Route::prefix('academic-years')->name('academic-years.')->group(function () {
            Route::get('/', [\App\Http\Controllers\Api\V1\AcademicYearController::class, 'index'])
                ->middleware('permission:academic_years.view')->name('index');
            Route::post('/', [\App\Http\Controllers\Api\V1\AcademicYearController::class, 'store'])
                ->middleware('permission:academic_years.manage')->name('store');
            Route::get('/{academic_year}', [\App\Http\Controllers\Api\V1\AcademicYearController::class, 'show'])
                ->middleware('permission:academic_years.view')->name('show');
            Route::put('/{academic_year}', [\App\Http\Controllers\Api\V1\AcademicYearController::class, 'update'])
                ->middleware('permission:academic_years.manage')->name('update');
        });

        // Departments
        Route::prefix('departments')->name('departments.')->group(function () {
            Route::get('/', [\App\Http\Controllers\Api\V1\DepartmentController::class, 'index'])
                ->middleware('permission:departments.view')->name('index');
            Route::post('/', [\App\Http\Controllers\Api\V1\DepartmentController::class, 'store'])
                ->middleware('permission:departments.manage')->name('store');
            Route::get('/{department}', [\App\Http\Controllers\Api\V1\DepartmentController::class, 'show'])
                ->middleware('permission:departments.view')->name('show');
            Route::put('/{department}', [\App\Http\Controllers\Api\V1\DepartmentController::class, 'update'])
                ->middleware('permission:departments.manage')->name('update');
        });

        // People (Staff)
        Route::prefix('people')->name('people.')->group(function () {
            Route::get('/', [\App\Http\Controllers\Api\V1\PersonController::class, 'index'])
                ->middleware('permission:people.view')->name('index');
            Route::post('/', [\App\Http\Controllers\Api\V1\PersonController::class, 'store'])
                ->middleware('permission:users.manage')->name('store');
            Route::get('/{person}', [\App\Http\Controllers\Api\V1\PersonController::class, 'show'])
                ->middleware('permission:people.view')->name('show');
            Route::put('/{person}', [\App\Http\Controllers\Api\V1\PersonController::class, 'update'])
                ->middleware('permission:users.manage')->name('update');
        });

        // Students
        Route::prefix('students')->name('students.')->group(function () {
            Route::get('/', [\App\Http\Controllers\Api\V1\StudentController::class, 'index'])
                ->middleware('permission:students.view')->name('index');
            Route::post('/', [\App\Http\Controllers\Api\V1\StudentController::class, 'store'])
                ->middleware('permission:students.create')->name('store');
            Route::post('/bulk-import', [\App\Http\Controllers\Api\V1\StudentController::class, 'bulkImport'])
                ->middleware('permission:students.create')->name('bulk-import');
            Route::post('/bulk-assign-advisor', [\App\Http\Controllers\Api\V1\StudentController::class, 'bulkAssignAdvisor'])
                ->middleware('permission:students.update')
                ->name('bulk-assign-advisor');
            Route::get('/{student}', [\App\Http\Controllers\Api\V1\StudentController::class, 'show'])
                ->middleware('permission:students.view')->name('show');
            Route::put('/{student}', [\App\Http\Controllers\Api\V1\StudentController::class, 'update'])
                ->middleware('permission:students.update')->name('update');
            Route::delete('/{student}', [\App\Http\Controllers\Api\V1\StudentController::class, 'destroy'])
                ->middleware('permission:students.delete')->name('destroy');
        });

        // Student Groups
        Route::prefix('student-groups')->name('student-groups.')->group(function () {
            Route::get('/', [\App\Http\Controllers\Api\V1\StudentGroupController::class, 'index'])
                ->middleware('permission:groups.view')->name('index');
            Route::post('/', [\App\Http\Controllers\Api\V1\StudentGroupController::class, 'store'])
                ->middleware('permission:groups.manage')->name('store');
            Route::get('/{student_group}', [\App\Http\Controllers\Api\V1\StudentGroupController::class, 'show'])
                ->middleware('permission:groups.view')->name('show');
        });

        Route::post('student-group-assignments', [\App\Http\Controllers\Api\V1\StudentGroupAssignmentController::class, 'store'])
            ->middleware('permission:groups.manage')->name('student-group-assignments.store');

        Route::get('courses', [\App\Http\Controllers\Api\V1\CourseController::class, 'index'])->middleware('permission:courses.view');
        Route::post('courses', [\App\Http\Controllers\Api\V1\CourseController::class, 'store'])->middleware('permission:courses.manage');
        Route::get('courses/{course}', [\App\Http\Controllers\Api\V1\CourseController::class, 'show'])->middleware('permission:courses.view');
        Route::put('courses/{course}', [\App\Http\Controllers\Api\V1\CourseController::class, 'update'])->middleware('permission:courses.manage');
        Route::delete('courses/{course}', [\App\Http\Controllers\Api\V1\CourseController::class, 'destroy'])->middleware('permission:courses.manage');
        Route::get('study-plans', [\App\Http\Controllers\Api\V1\StudyPlanController::class, 'index'])->middleware('permission:courses.view');
        Route::get('study-plans/{studyPlan}', [\App\Http\Controllers\Api\V1\StudyPlanController::class, 'show'])->middleware('permission:courses.view');
        Route::post('study-plans', [\App\Http\Controllers\Api\V1\StudyPlanController::class, 'store'])->middleware('permission:courses.manage');
        Route::put('study-plans/{studyPlan}', [\App\Http\Controllers\Api\V1\StudyPlanController::class, 'update'])->middleware('permission:courses.manage');
        Route::delete('study-plans/{studyPlan}', [\App\Http\Controllers\Api\V1\StudyPlanController::class, 'destroy'])->middleware('permission:courses.manage');
        Route::post('study-plans/{studyPlan}/courses', [\App\Http\Controllers\Api\V1\StudyPlanController::class, 'addCourse'])->middleware('permission:courses.manage');
        Route::delete('study-plans/{studyPlan}/courses/{courseId}', [\App\Http\Controllers\Api\V1\StudyPlanController::class, 'removeCourse'])->middleware('permission:courses.manage');
        Route::get('student-course-enrollments', [\App\Http\Controllers\Api\V1\StudentCourseEnrollmentController::class, 'index'])->middleware('permission:students.view');
        Route::post('student-course-enrollments', [\App\Http\Controllers\Api\V1\StudentCourseEnrollmentController::class, 'store'])->middleware('permission:courses.manage');
        Route::get('grade-entries', [\App\Http\Controllers\Api\V1\GradeEntryController::class, 'index'])->middleware('permission:grades.view');
        Route::post('grade-entries', [\App\Http\Controllers\Api\V1\GradeEntryController::class, 'store'])->middleware('permission:grades.create');
        Route::post('grade-entries/batch', [\App\Http\Controllers\Api\V1\GradeEntryController::class, 'batchStore'])->middleware('permission:grades.create');
        Route::post('grade-entries/batch-submit', [\App\Http\Controllers\Api\V1\GradeEntryController::class, 'batchSubmit'])->middleware('permission:grades.create');
        Route::post('grade-entries/batch-approve', [\App\Http\Controllers\Api\V1\GradeEntryController::class, 'batchApprove'])->middleware('permission:grades.approve');
        Route::post('grade-entries/batch-return', [\App\Http\Controllers\Api\V1\GradeEntryController::class, 'batchReturn'])->middleware('permission:grades.approve');
        Route::get('clinical-sessions', [\App\Http\Controllers\Api\V1\ClinicalSessionController::class, 'index'])->middleware('permission:attendance.view');
        Route::post('clinical-sessions', [\App\Http\Controllers\Api\V1\ClinicalSessionController::class, 'store'])->middleware('permission:attendance.record');
        Route::get('attendance-records', [\App\Http\Controllers\Api\V1\AttendanceRecordController::class, 'index'])->middleware('permission:attendance.view');
        Route::post('attendance-records', [\App\Http\Controllers\Api\V1\AttendanceRecordController::class, 'store'])->middleware('permission:attendance.record');
        Route::get('clinical-assessments', [\App\Http\Controllers\Api\V1\ClinicalAssessmentController::class, 'index'])->middleware('permission:assessment.view');
        Route::post('clinical-assessments', [\App\Http\Controllers\Api\V1\ClinicalAssessmentController::class, 'store'])->middleware('permission:assessment.create');
        Route::post('clinical-assessments/{clinicalAssessment}/submit', [\App\Http\Controllers\Api\V1\ClinicalAssessmentController::class, 'submit'])->middleware('permission:assessment.submit');
        Route::get('advising-records', [\App\Http\Controllers\Api\V1\AdvisingRecordController::class, 'index'])->middleware('permission:advising.view');
        Route::get('advising-records/{advisingRecord}', [\App\Http\Controllers\Api\V1\AdvisingRecordController::class, 'show'])->middleware('permission:advising.view');
        Route::post('advising-records', [\App\Http\Controllers\Api\V1\AdvisingRecordController::class, 'store'])->middleware('permission:advising.manage');
        Route::put('advising-records/{advisingRecord}', [\App\Http\Controllers\Api\V1\AdvisingRecordController::class, 'update'])->middleware('permission:advising.manage');
        Route::get('correspondence', [\App\Http\Controllers\Api\V1\CorrespondenceController::class, 'index'])->middleware('permission:correspondence.view');
        Route::get('correspondence/{correspondence}', [\App\Http\Controllers\Api\V1\CorrespondenceController::class, 'show'])->middleware('permission:correspondence.view');
        Route::post('correspondence', [\App\Http\Controllers\Api\V1\CorrespondenceController::class, 'store'])->middleware('permission:correspondence.create');
        Route::post('correspondence/{correspondence}/submit', [\App\Http\Controllers\Api\V1\CorrespondenceController::class, 'submit'])->middleware('permission:correspondence.submit');
        Route::post('correspondence/{correspondence}/close', [\App\Http\Controllers\Api\V1\CorrespondenceController::class, 'close'])->middleware('permission:correspondence.manage');
        Route::post('correspondence/{correspondence}/return', [\App\Http\Controllers\Api\V1\CorrespondenceController::class, 'returnCorrespondence'])->middleware('permission:correspondence.submit');
        Route::post('correspondence/{correspondence}/forward', [\App\Http\Controllers\Api\V1\CorrespondenceController::class, 'forward'])->middleware('permission:correspondence.submit');
        Route::post('correspondence/{correspondence}/approve', [\App\Http\Controllers\Api\V1\CorrespondenceController::class, 'approve'])->middleware('permission:correspondence.submit');
        Route::get('operational-tasks', [\App\Http\Controllers\Api\V1\OperationalTaskController::class, 'index'])->middleware('permission:tasks.view');
        Route::post('operational-tasks', [\App\Http\Controllers\Api\V1\OperationalTaskController::class, 'store'])->middleware('permission:tasks.manage');
        Route::put('operational-tasks/{operationalTask}', [\App\Http\Controllers\Api\V1\OperationalTaskController::class, 'update'])->middleware('permission:tasks.manage');
        Route::get('quality-surveys', [\App\Http\Controllers\Api\V1\QualitySurveyController::class, 'index'])->middleware('permission:quality.view');
        Route::post('quality-surveys', [\App\Http\Controllers\Api\V1\QualitySurveyController::class, 'store'])->middleware('permission:quality.manage');
        Route::get('quality-surveys/{qualitySurvey}', [\App\Http\Controllers\Api\V1\QualitySurveyController::class, 'show'])->middleware('permission:quality.view');
        Route::get('quality-surveys/{qualitySurvey}/responses', [\App\Http\Controllers\Api\V1\QualitySurveyController::class, 'responses'])->middleware('permission:quality.view');
        Route::post('quality-surveys/{qualitySurvey}/questions', [\App\Http\Controllers\Api\V1\QualitySurveyController::class, 'storeQuestion'])->middleware('permission:quality.manage');
        Route::post('quality-surveys/{qualitySurvey}/responses', [\App\Http\Controllers\Api\V1\QualitySurveyController::class, 'storeResponse'])->middleware('permission:quality.manage');
        Route::get('quality-improvement-plans', [\App\Http\Controllers\Api\V1\QualityImprovementController::class, 'plans'])->middleware('permission:quality.view');
        Route::post('quality-improvement-plans', [\App\Http\Controllers\Api\V1\QualityImprovementController::class, 'storePlan'])->middleware('permission:quality.manage');
        Route::get('quality-kpis', [\App\Http\Controllers\Api\V1\QualityImprovementController::class, 'kpis'])->middleware('permission:quality.view');
        Route::post('quality-kpis', [\App\Http\Controllers\Api\V1\QualityImprovementController::class, 'storeKpi'])->middleware('permission:kpi.manage');
        Route::get('meetings', [\App\Http\Controllers\Api\V1\MeetingController::class, 'index'])->middleware('permission:meetings.manage');
        Route::post('meetings', [\App\Http\Controllers\Api\V1\MeetingController::class, 'store'])->middleware('permission:meetings.manage');
        Route::post('meetings/{meeting}/actions', [\App\Http\Controllers\Api\V1\MeetingController::class, 'storeAction'])->middleware('permission:meetings.manage');

        // Department Heads Routes
        Route::get('dept-heads', [\App\Http\Controllers\Api\V1\DepartmentHeadController::class, 'index'])
            ->middleware('permission:people.view');
        Route::get('dept-heads/{id}', [\App\Http\Controllers\Api\V1\DepartmentHeadController::class, 'show']);
        Route::put('dept-heads/{id}', [\App\Http\Controllers\Api\V1\DepartmentHeadController::class, 'update']);
        Route::post('dept-heads/{id}/evaluation', [\App\Http\Controllers\Api\V1\DepartmentHeadController::class, 'saveEvaluation']);
        Route::post('dept-heads/{id}/weights', [\App\Http\Controllers\Api\V1\DepartmentHeadController::class, 'saveWeights']);
        Route::post('dept-heads/{id}/overrides', [\App\Http\Controllers\Api\V1\DepartmentHeadController::class, 'saveOverrides']);
        Route::post('dept-heads/{id}/avatar', [\App\Http\Controllers\Api\V1\DepartmentHeadController::class, 'uploadAvatar']);
        Route::post('dept-heads/{id}/documents', [\App\Http\Controllers\Api\V1\DepartmentHeadController::class, 'uploadDocument']);
        Route::get('dept-heads/{id}/documents/{docId}/download', [\App\Http\Controllers\Api\V1\DepartmentHeadController::class, 'downloadDocument']);
        Route::delete('dept-heads/{id}/documents/{docId}', [\App\Http\Controllers\Api\V1\DepartmentHeadController::class, 'deleteDocument']);

        // Clinical Supervisors Routes
        Route::get('clinical-supervisors', [\App\Http\Controllers\Api\V1\ClinicalSupervisorController::class, 'index'])
            ->middleware('permission:people.view');
        Route::get('clinical-supervisors/{id}', [\App\Http\Controllers\Api\V1\ClinicalSupervisorController::class, 'show']);
        Route::put('clinical-supervisors/{id}', [\App\Http\Controllers\Api\V1\ClinicalSupervisorController::class, 'update']);
        Route::post('clinical-supervisors/{id}/evaluation', [\App\Http\Controllers\Api\V1\ClinicalSupervisorController::class, 'saveEvaluation']);
        Route::post('clinical-supervisors/{id}/avatar', [\App\Http\Controllers\Api\V1\ClinicalSupervisorController::class, 'uploadAvatar']);
        Route::post('clinical-supervisors/{id}/documents', [\App\Http\Controllers\Api\V1\ClinicalSupervisorController::class, 'uploadDocument']);
        Route::get('clinical-supervisors/{id}/documents/{docId}/download', [\App\Http\Controllers\Api\V1\ClinicalSupervisorController::class, 'downloadDocument']);
        Route::delete('clinical-supervisors/{id}/documents/{docId}', [\App\Http\Controllers\Api\V1\ClinicalSupervisorController::class, 'deleteDocument']);
        Route::get('academic-calendar-events', [\App\Http\Controllers\Api\V1\AcademicCalendarEventController::class, 'index'])->middleware('permission:academic_years.view');
        Route::post('academic-calendar-events', [\App\Http\Controllers\Api\V1\AcademicCalendarEventController::class, 'store'])->middleware('permission:academic_years.manage');
        // Supervisor Annual Workloads
        Route::get('supervisor-annual-workloads', [\App\Http\Controllers\Api\V1\SupervisorAnnualWorkloadController::class, 'index'])
            ->middleware('permission:people.view');
        Route::post('supervisor-annual-workloads', [\App\Http\Controllers\Api\V1\SupervisorAnnualWorkloadController::class, 'store'])->middleware('permission:users.manage');
        Route::put('supervisor-annual-workloads/{workload}', [\App\Http\Controllers\Api\V1\SupervisorAnnualWorkloadController::class, 'update'])->middleware('permission:users.manage');
        Route::post('supervisor-annual-workloads/{workload}/archive', [\App\Http\Controllers\Api\V1\SupervisorAnnualWorkloadController::class, 'archive'])->middleware('permission:users.manage');

        // Evaluation Form Versions & Items
        Route::get('evaluation-form-reference', [\App\Http\Controllers\Api\V1\EvaluationFormReferenceController::class, 'index'])->middleware('permission:assessment.view');
        Route::post('evaluation-form-versions', [\App\Http\Controllers\Api\V1\EvaluationFormReferenceController::class, 'storeVersion'])->middleware('permission:assessment.create');
        Route::put('evaluation-form-versions/{version}', [\App\Http\Controllers\Api\V1\EvaluationFormReferenceController::class, 'updateVersion'])->middleware('permission:assessment.create');
        Route::post('evaluation-form-versions/{version}/archive', [\App\Http\Controllers\Api\V1\EvaluationFormReferenceController::class, 'archiveVersion'])->middleware('permission:assessment.create');
        Route::post('evaluation-form-items', [\App\Http\Controllers\Api\V1\EvaluationFormReferenceController::class, 'storeItem'])->middleware('permission:assessment.create');
        Route::put('evaluation-form-items/{item}', [\App\Http\Controllers\Api\V1\EvaluationFormReferenceController::class, 'updateItem'])->middleware('permission:assessment.create');
        Route::post('evaluation-form-items/{item}/archive', [\App\Http\Controllers\Api\V1\EvaluationFormReferenceController::class, 'archiveItem'])->middleware('permission:assessment.create');

        // Research Projects
        Route::get('research-projects', [\App\Http\Controllers\Api\V1\ResearchProjectController::class, 'index'])->middleware('permission:courses.view');
        Route::post('research-projects', [\App\Http\Controllers\Api\V1\ResearchProjectController::class, 'store'])->middleware('permission:courses.manage');
        Route::put('research-projects/{researchProject}', [\App\Http\Controllers\Api\V1\ResearchProjectController::class, 'update'])->middleware('permission:courses.manage');
        Route::post('research-projects/{researchProject}/archive', [\App\Http\Controllers\Api\V1\ResearchProjectController::class, 'archive'])->middleware('permission:courses.manage');

        // External Electives
        Route::get('external-electives', [\App\Http\Controllers\Api\V1\ExternalElectiveController::class, 'index'])->middleware('permission:courses.view');
        Route::post('external-electives', [\App\Http\Controllers\Api\V1\ExternalElectiveController::class, 'store'])->middleware('permission:courses.manage');
        Route::put('external-electives/{externalElective}', [\App\Http\Controllers\Api\V1\ExternalElectiveController::class, 'update'])->middleware('permission:courses.manage');
        Route::post('external-electives/{externalElective}/archive', [\App\Http\Controllers\Api\V1\ExternalElectiveController::class, 'archive'])->middleware('permission:courses.manage');

        // Skill Logbook Requirements
        Route::get('skill-logbook-requirements', [\App\Http\Controllers\Api\V1\SkillLogbookRequirementController::class, 'index'])->middleware('permission:assessment.view');
        Route::post('skill-logbook-requirements', [\App\Http\Controllers\Api\V1\SkillLogbookRequirementController::class, 'store'])->middleware('permission:assessment.create');
        Route::put('skill-logbook-requirements/{requirement}', [\App\Http\Controllers\Api\V1\SkillLogbookRequirementController::class, 'update'])->middleware('permission:assessment.create');
        Route::post('skill-logbook-requirements/{requirement}/archive', [\App\Http\Controllers\Api\V1\SkillLogbookRequirementController::class, 'archive'])->middleware('permission:assessment.create');

        // Weekly Supervisor Allocations
        Route::post('weekly-supervisor-allocations', [\App\Http\Controllers\Api\V1\StaffAllocationController::class, 'storeAllocation'])->middleware('permission:users.manage');
        Route::put('weekly-supervisor-allocations/{allocation}', [\App\Http\Controllers\Api\V1\StaffAllocationController::class, 'updateAllocation'])->middleware('permission:users.manage');
        Route::post('weekly-supervisor-allocations/{allocation}/archive', [\App\Http\Controllers\Api\V1\StaffAllocationController::class, 'archiveAllocation'])->middleware('permission:users.manage');

        // Workflow transitions — Package C
        Route::post('grade-entries/{gradeEntry}/submit', [\App\Http\Controllers\Api\V1\GradeEntryController::class, 'submit'])->middleware('permission:grades.create');
        Route::post('grade-entries/{gradeEntry}/return', [\App\Http\Controllers\Api\V1\GradeEntryController::class, 'returnGrade'])->middleware('permission:grades.approve');
        Route::post('grade-entries/{gradeEntry}/approve', [\App\Http\Controllers\Api\V1\GradeEntryController::class, 'approve'])->middleware('permission:grades.approve');
        Route::post('clinical-assessments/{clinicalAssessment}/return', [\App\Http\Controllers\Api\V1\ClinicalAssessmentController::class, 'returnAssessment'])->middleware('permission:assessment.approve');
        Route::post('quality-improvement-plans/{plan}/transition', [\App\Http\Controllers\Api\V1\QualityImprovementController::class, 'transition'])->middleware('permission:quality.manage');

        // Annual Report
        Route::get('annual-report-entries', [\App\Http\Controllers\Api\V1\AnnualReportEntryController::class, 'index'])->middleware('permission:reports.view');
        Route::get('annual-report-entries/export', [\App\Http\Controllers\Api\V1\AnnualReportEntryController::class, 'export'])->middleware('permission:reports.export');

        // Staff Allocations
        Route::get('staff-allocations', [\App\Http\Controllers\Api\V1\StaffAllocationController::class, 'index'])->middleware('permission:people.view');

        // Audit Logs — Package D
        Route::get('audit-logs', [\App\Http\Controllers\Api\V1\AuditLogController::class, 'index'])->middleware('permission:audit.view');
        Route::get('audit-logs/export', [\App\Http\Controllers\Api\V1\AuditLogController::class, 'export'])->middleware('permission:reports.export');
        Route::get('audit-logs/{auditLog}', [\App\Http\Controllers\Api\V1\AuditLogController::class, 'show'])->middleware('permission:audit.view');

        // CSV Exports — Package E
        Route::prefix('export')->name('export.')->middleware(['permission:reports.export', 'throttle:export'])->group(function () {
            Route::get('students', [\App\Http\Controllers\Api\V1\CsvExportController::class, 'students'])->name('students');
            Route::get('staff', [\App\Http\Controllers\Api\V1\CsvExportController::class, 'staff'])->name('staff');
            Route::get('attendance', [\App\Http\Controllers\Api\V1\CsvExportController::class, 'attendance'])->name('attendance');
            Route::get('grades', [\App\Http\Controllers\Api\V1\CsvExportController::class, 'grades'])->name('grades');
            Route::get('assessments', [\App\Http\Controllers\Api\V1\CsvExportController::class, 'assessments'])->name('assessments');
            Route::get('correspondence', [\App\Http\Controllers\Api\V1\CsvExportController::class, 'correspondence'])->name('correspondence');
            Route::get('tasks', [\App\Http\Controllers\Api\V1\CsvExportController::class, 'tasks'])->name('tasks');
            Route::get('quality', [\App\Http\Controllers\Api\V1\CsvExportController::class, 'quality'])->name('quality');
            Route::get('workloads', [\App\Http\Controllers\Api\V1\CsvExportController::class, 'workloads'])->name('workloads');
            Route::get('allocations', [\App\Http\Controllers\Api\V1\CsvExportController::class, 'allocations'])->name('allocations');
        });

        // Training Sites
        Route::prefix('training-sites')->name('training-sites.')->group(function () {
            Route::get('/', [\App\Http\Controllers\Api\V1\TrainingSiteController::class, 'index'])
                ->middleware('permission:training_sites.view')->name('index');
            Route::post('/', [\App\Http\Controllers\Api\V1\TrainingSiteController::class, 'store'])
                ->middleware('permission:training_sites.manage')->name('store');
            Route::get('/{training_site}', [\App\Http\Controllers\Api\V1\TrainingSiteController::class, 'show'])
                ->middleware('permission:training_sites.view')->name('show');
            Route::put('/{training_site}', [\App\Http\Controllers\Api\V1\TrainingSiteController::class, 'update'])
                ->middleware('permission:training_sites.manage')->name('update');
        });

        // Partnerships
        Route::prefix('partnerships')->name('partnerships.')->group(function () {
            Route::get('/', [\App\Http\Controllers\Api\V1\PartnershipController::class, 'index'])
                ->middleware('permission:partnerships.view')->name('index');
            Route::post('/', [\App\Http\Controllers\Api\V1\PartnershipController::class, 'store'])
                ->middleware('permission:partnerships.manage')->name('store');
            Route::get('/{partnership}', [\App\Http\Controllers\Api\V1\PartnershipController::class, 'show'])
                ->middleware('permission:partnerships.view')->name('show');
            Route::put('/{partnership}', [\App\Http\Controllers\Api\V1\PartnershipController::class, 'update'])
                ->middleware('permission:partnerships.manage')->name('update');
        });
        // ---------------------------------------------------------------------
        // Rotations (Phase 3B-1)
        // ---------------------------------------------------------------------
        Route::post('rotations/{rotation}/validate-distribution', [\App\Http\Controllers\Api\V1\RotationController::class, 'validateDistribution'])
            ->middleware('permission:distribution.validate')
            ->name('rotations.validate-distribution');
            
        Route::get('rotations/{rotation}/distribution/candidates', [\App\Http\Controllers\Api\V1\RotationController::class, 'generateCandidates'])
            ->middleware('permission:distribution.validate')
            ->name('rotations.distribution.candidates');
            
        Route::post('rotations/{rotation}/distribution/generate', [\App\Http\Controllers\Api\V1\RotationController::class, 'generateDistribution'])
            ->middleware('permission:distribution.generate')
            ->name('rotations.distribution.generate');

        // Distribution Manual Management
        Route::get('distribution-versions/{version}/assignments', [\App\Http\Controllers\Api\V1\DistributionAssignmentController::class, 'index'])
            ->middleware('permission:distribution.view')
            ->name('distribution-versions.assignments.index');
            
        Route::post('distribution-versions/{version}/assignments', [\App\Http\Controllers\Api\V1\DistributionAssignmentController::class, 'store'])
            ->middleware('permission:distribution.create')
            ->name('distribution-versions.assignments.store');
            
        Route::put('distribution-versions/{version}/assignments/{assignment}', [\App\Http\Controllers\Api\V1\DistributionAssignmentController::class, 'update'])
            ->middleware('permission:distribution.update')
            ->name('distribution-versions.assignments.update')
            ->scopeBindings();
            
        Route::delete('distribution-versions/{version}/assignments/{assignment}', [\App\Http\Controllers\Api\V1\DistributionAssignmentController::class, 'destroy'])
            ->middleware('permission:distribution.delete')
            ->name('distribution-versions.assignments.destroy')
            ->scopeBindings();

        // Distribution Versions Workbench Read APIs
        Route::get('distribution-versions', [\App\Http\Controllers\Api\V1\DistributionVersionController::class, 'index'])
            ->middleware('permission:distribution.view')
            ->name('distribution-versions.index');

        Route::get('distribution-versions/{version}', [\App\Http\Controllers\Api\V1\DistributionVersionController::class, 'show'])
            ->middleware('permission:distribution.view')
            ->name('distribution-versions.show');

        Route::get('distribution-versions/{version}/audit-logs', [\App\Http\Controllers\Api\V1\DistributionVersionController::class, 'auditLogs'])
            ->middleware('permission:distribution.view')
            ->name('distribution-versions.audit-logs');

        Route::get('distribution-versions/{version}/unassigned', [\App\Http\Controllers\Api\V1\DistributionVersionController::class, 'unassigned'])
            ->middleware('permission:distribution.view')
            ->name('distribution-versions.unassigned');

        Route::get('distribution-versions/{version}/conflicts', [\App\Http\Controllers\Api\V1\DistributionVersionController::class, 'conflicts'])
            ->middleware('permission:distribution.view')
            ->name('distribution-versions.conflicts');

        // Distribution Version Lifecycle & Comparison
        Route::post('distribution-versions/{version}/approve', [\App\Http\Controllers\Api\V1\DistributionApprovalController::class, 'store'])
            ->middleware('permission:distribution.approve')
            ->name('distribution-versions.approve');
            
        Route::post('distribution-versions/{version}/publish', [\App\Http\Controllers\Api\V1\DistributionPublicationController::class, 'store'])
            ->middleware('permission:distribution.publish')
            ->name('distribution-versions.publish');
            
        Route::get('distribution-versions/{version}/compare/{otherVersion}', [\App\Http\Controllers\Api\V1\DistributionVersionComparisonController::class, 'show'])
            ->middleware('permission:distribution.view')
            ->name('distribution-versions.compare');

        // Phase 5B — Operational Clinical Schedule APIs
        Route::get('operational/clinical-schedule', [\App\Http\Controllers\Api\V1\OperationalDistributionController::class, 'administrativeSchedule'])
            ->middleware('permission:distribution.view')
            ->name('operational.clinical-schedule');

        Route::get('users/lookup', [\App\Http\Controllers\Api\V1\UserController::class, 'lookup'])
            ->middleware('permission.any:people.view,students.view,correspondence.view');

        // Keep static user paths before apiResource('users') so "rta-list"
        // can never be consumed by the /users/{user} model-binding route.
        Route::middleware(['permission:students.view'])->group(function () {
            Route::get('users/rta-list', [\App\Http\Controllers\Api\V1\UserController::class, 'rtaList']);
            Route::put('users/{user}/assign-levels', [\App\Http\Controllers\Api\V1\UserController::class, 'assignLevels']);
        });

        // Technical administration. These endpoints intentionally live only
        // under /admin; the UI routes use the same canonical API namespace.
        Route::prefix('admin')->name('admin.')->middleware(['permission:users.manage'])->group(function () {
            Route::get('health', [\App\Http\Controllers\Api\V1\SystemAdminController::class, 'health'])
                ->middleware('permission:settings.manage')->name('health');
            Route::get('sessions', [\App\Http\Controllers\Api\V1\SystemAdminController::class, 'sessions'])->name('sessions.index');
            Route::post('sessions/{user}/revoke', [\App\Http\Controllers\Api\V1\SystemAdminController::class, 'revokeSession'])->name('sessions.revoke');
            Route::get('permissions/matrix', [\App\Http\Controllers\Api\V1\SystemAdminController::class, 'permissionMatrix'])
                ->middleware('permission:roles.manage')->name('permissions.matrix');
            Route::post('permissions/toggle', [\App\Http\Controllers\Api\V1\SystemAdminController::class, 'togglePermission'])
                ->middleware('permission:roles.manage')->name('permissions.toggle');
            Route::get('settings', [\App\Http\Controllers\Api\V1\SystemAdminController::class, 'getSettings'])
                ->middleware('permission:settings.manage')->name('settings.show');
            Route::post('settings', [\App\Http\Controllers\Api\V1\SystemAdminController::class, 'updateSettings'])
                ->middleware('permission:settings.manage')->name('settings.update');
        });

        Route::prefix('users')->name('users.')->middleware(['permission:users.manage'])->group(function () {
            // Static routes must precede /{user} routes to avoid model-binding collisions.
            Route::get('roles', [\App\Http\Controllers\Api\V1\UserController::class, 'getRoles'])->name('roles');
            Route::get('departments-for-assignment', [\App\Http\Controllers\Api\V1\UserController::class, 'departmentsForAssignment'])
                ->name('departments-for-assignment');
            Route::post('{user}/toggle', [\App\Http\Controllers\Api\V1\UserController::class, 'toggleActive'])->name('toggle');
            Route::post('{user}/reset-password', [\App\Http\Controllers\Api\V1\UserController::class, 'resetPassword'])->name('reset-password');
        });

        Route::middleware(['permission:users.manage'])->group(function () {
            Route::apiResource('users', \App\Http\Controllers\Api\V1\UserController::class);

            // Admin Departments Management
            Route::get('departments-manage/candidates', [\App\Http\Controllers\Api\V1\AdminDepartmentController::class, 'candidates']);
            Route::post('departments-manage/{department}/assign-leaders', [\App\Http\Controllers\Api\V1\AdminDepartmentController::class, 'assignLeaders']);
            Route::post('departments-manage/{department}/toggle', [\App\Http\Controllers\Api\V1\AdminDepartmentController::class, 'toggle']);
            Route::apiResource('departments-manage', \App\Http\Controllers\Api\V1\AdminDepartmentController::class)->parameters(['departments-manage' => 'department']);

        });

        // Phase 5A — Core Operational Read APIs
        Route::get('rotations/{rotation}/current-distribution', [\App\Http\Controllers\Api\V1\OperationalDistributionController::class, 'currentDistribution'])
            ->middleware('permission:distribution.view')
            ->name('rotations.current-distribution');

        Route::get('rotations/{rotation}/current-distribution/summary', [\App\Http\Controllers\Api\V1\OperationalDistributionController::class, 'currentDistributionSummary'])
            ->middleware('permission:distribution.view')
            ->name('rotations.current-distribution.summary');

        Route::get('rotations/{rotation}/current-distribution/unassigned', [\App\Http\Controllers\Api\V1\OperationalDistributionController::class, 'unassignedStudents'])
            ->middleware('permission:distribution.view')
            ->name('rotations.current-distribution.unassigned');

        Route::get('operational/distribution-payload/{key?}', [\App\Http\Controllers\Api\V1\OperationalDistributionController::class, 'getDistributionPayload'])
            ->middleware('permission.any:distribution.view,grades.view,assessment.view,advising.view')
            ->where('key', '.*');
        Route::post('operational/distribution-payload', [\App\Http\Controllers\Api\V1\OperationalDistributionController::class, 'saveDistributionPayload'])
            ->middleware('permission.any:distribution.update,grades.create,assessment.create,attendance.record,advising.manage');

        Route::get('students/{student}/current-clinical-schedule', [\App\Http\Controllers\Api\V1\OperationalDistributionController::class, 'studentSchedule'])
            ->middleware('permission:distribution.view')
            ->name('students.current-clinical-schedule');

        Route::get('supervisors/{person}/current-clinical-schedule', [\App\Http\Controllers\Api\V1\OperationalDistributionController::class, 'supervisorSchedule'])
            ->middleware('permission:distribution.view')
            ->name('supervisors.current-clinical-schedule');

        Route::get('departments/{department}/current-distribution', [\App\Http\Controllers\Api\V1\OperationalDistributionController::class, 'departmentDistribution'])
            ->middleware('permission:distribution.view')
            ->name('departments.current-distribution');

        Route::get('training-sites/{trainingSite}/current-distribution', [\App\Http\Controllers\Api\V1\OperationalDistributionController::class, 'trainingSiteDistribution'])
            ->middleware('permission:distribution.view')
            ->name('training-sites.current-distribution');

        // Phase 5D — Department & Training Site Rosters
        Route::get('departments/{department}/current-distribution/roster', [\App\Http\Controllers\Api\V1\DepartmentRosterController::class, 'roster'])
            ->middleware('permission:distribution.view')
            ->name('departments.current-distribution.roster');

        Route::get('departments/{department}/current-distribution/summary', [\App\Http\Controllers\Api\V1\DepartmentRosterController::class, 'summary'])
            ->middleware('permission:distribution.view')
            ->name('departments.current-distribution.summary');

        Route::get('training-sites/{trainingSite}/current-distribution/roster', [\App\Http\Controllers\Api\V1\TrainingSiteRosterController::class, 'roster'])
            ->middleware('permission:distribution.view')
            ->name('training-sites.current-distribution.roster');

        Route::get('training-sites/{trainingSite}/current-distribution/summary', [\App\Http\Controllers\Api\V1\TrainingSiteRosterController::class, 'summary'])
            ->middleware('permission:distribution.view')
            ->name('training-sites.current-distribution.summary');

        // Phase 6B — Clinical Operations Dashboard
        Route::get('operational/dashboard/summary', [\App\Http\Controllers\Api\V1\OperationalDashboardController::class, 'summary'])
            ->middleware(['permission:distribution.view', 'throttle:operational-read'])
            ->name('operational.dashboard.summary');

        // Phase 5E — Operational Reports (Rate limited by export limiter)
        Route::prefix('operational/reports')->name('operational.reports.')->middleware(['permission:distribution.view', 'throttle:export'])->group(function () {
            Route::get('students', [\App\Http\Controllers\Api\V1\OperationalReportController::class, 'studentDistribution'])->name('students');
            Route::get('departments/{department}', [\App\Http\Controllers\Api\V1\OperationalReportController::class, 'departmentDistribution'])->name('departments');
            Route::get('sites', [\App\Http\Controllers\Api\V1\OperationalReportController::class, 'trainingSiteCapacity'])->name('sites');
            Route::get('supervisors/{supervisor}', [\App\Http\Controllers\Api\V1\OperationalReportController::class, 'supervisorDistribution'])->name('supervisors');
            Route::get('unassigned', [\App\Http\Controllers\Api\V1\OperationalReportController::class, 'unassignedStudents'])->name('unassigned');
        });

        // Phase 5C — Post-Publication Supervisor Management & Supervisor Portal
        // PUT: reassign supervisor on a published assignment (placement immutable, only supervisor_id changes)
        Route::put('operational/assignments/{assignment}/supervisor', [\App\Http\Controllers\Api\V1\SupervisorController::class, 'reassign'])
            ->middleware('permission:distribution.update')
            ->name('operational.assignments.supervisor.reassign');

        // GET: authenticated user's own supervisor portal view (my assigned students in current published)
        Route::get('operational/my-supervisor-assignments', [\App\Http\Controllers\Api\V1\SupervisorController::class, 'myAssignments'])
            ->middleware('permission:distribution.view')
            ->name('operational.my-supervisor-assignments');

        // GET: admin view of any supervisor's current assignments
        Route::get('operational/supervisors/{person}/assignments', [\App\Http\Controllers\Api\V1\SupervisorController::class, 'supervisorAssignments'])
            ->middleware('permission:distribution.view')
            ->name('operational.supervisors.assignments');

        Route::apiResource('rotations', App\Http\Controllers\Api\V1\RotationController::class)
            ->middleware([
                'index' => 'permission:rotations.view',
                'show' => 'permission:rotations.view',
                'store' => 'permission:rotations.create',
                'update' => 'permission:rotations.update',
                'destroy' => 'permission:rotations.delete',
            ]);

    });
});

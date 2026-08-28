<?php

use App\Http\Controllers\Api\V1\AcademicCalendarEventController;
use App\Http\Controllers\Api\V1\AcademicYearController;
use App\Http\Controllers\Api\V1\AdminDepartmentController;
use App\Http\Controllers\Api\V1\AdvisingRecordController;
use App\Http\Controllers\Api\V1\AnnualReportEntryController;
use App\Http\Controllers\Api\V1\AttendanceRecordController;
use App\Http\Controllers\Api\V1\AttendanceWarningController;
use App\Http\Controllers\Api\V1\AuditLogController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\ClinicalAssessmentController;
use App\Http\Controllers\Api\V1\ClinicalSessionController;
use App\Http\Controllers\Api\V1\ClinicalSupervisorController;
use App\Http\Controllers\Api\V1\CorrespondenceController;
use App\Http\Controllers\Api\V1\CourseController;
use App\Http\Controllers\Api\V1\CourseDistributionController;
use App\Http\Controllers\Api\V1\CourseReportController;
use App\Http\Controllers\Api\V1\CsvExportController;
use App\Http\Controllers\Api\V1\DashboardOverviewController;
use App\Http\Controllers\Api\V1\DepartmentController;
use App\Http\Controllers\Api\V1\DepartmentHeadController;
use App\Http\Controllers\Api\V1\DepartmentHeadEvaluationController;
use App\Http\Controllers\Api\V1\DepartmentRosterController;
use App\Http\Controllers\Api\V1\DistributionApprovalController;
use App\Http\Controllers\Api\V1\DistributionAssignmentController;
use App\Http\Controllers\Api\V1\DistributionPublicationController;
use App\Http\Controllers\Api\V1\DistributionSubgroupController;
use App\Http\Controllers\Api\V1\DistributionVersionComparisonController;
use App\Http\Controllers\Api\V1\DistributionVersionController;
use App\Http\Controllers\Api\V1\EvaluationFormReferenceController;
use App\Http\Controllers\Api\V1\ExternalElectiveController;
use App\Http\Controllers\Api\V1\GradeEntryController;
use App\Http\Controllers\Api\V1\GroupRegistrationAdminController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\MeetingController;
use App\Http\Controllers\Api\V1\OperationalDashboardController;
use App\Http\Controllers\Api\V1\OperationalDistributionController;
use App\Http\Controllers\Api\V1\OperationalReportController;
use App\Http\Controllers\Api\V1\OperationalTaskController;
use App\Http\Controllers\Api\V1\PartnershipController;
use App\Http\Controllers\Api\V1\PersonController;
use App\Http\Controllers\Api\V1\PublicGroupRegistrationController;
use App\Http\Controllers\Api\V1\PublicStudentScheduleController;
use App\Http\Controllers\Api\V1\QualityImprovementController;
use App\Http\Controllers\Api\V1\QualitySurveyController;
use App\Http\Controllers\Api\V1\ReportCenterController;
use App\Http\Controllers\Api\V1\ResearchProjectController;
use App\Http\Controllers\Api\V1\RotationController;
use App\Http\Controllers\Api\V1\SkillLogbookRequirementController;
use App\Http\Controllers\Api\V1\StaffAllocationController;
use App\Http\Controllers\Api\V1\StudentController;
use App\Http\Controllers\Api\V1\StudentCourseEnrollmentController;
use App\Http\Controllers\Api\V1\StudentGroupAssignmentController;
use App\Http\Controllers\Api\V1\StudentGroupController;
use App\Http\Controllers\Api\V1\StudentSchedulePortalController;
use App\Http\Controllers\Api\V1\StudyPlanController;
use App\Http\Controllers\Api\V1\SupervisorAnnualWorkloadController;
use App\Http\Controllers\Api\V1\SupervisorController;
use App\Http\Controllers\Api\V1\SystemAdminController;
use App\Http\Controllers\Api\V1\TrainingSiteController;
use App\Http\Controllers\Api\V1\TrainingSiteRosterController;
use App\Http\Controllers\Api\V1\UserController;
use App\Http\Controllers\Api\V1\UserProfileController;
use App\Http\Controllers\ProgramOutcomeController;
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
        Route::post('student-schedule/request-otp', [PublicStudentScheduleController::class, 'requestOtp'])->middleware('throttle:student-otp-request');
        Route::post('student-schedule/verify-otp', [PublicStudentScheduleController::class, 'verifyOtp'])->middleware('throttle:student-otp-verify');
        Route::post('student-schedule', [PublicStudentScheduleController::class, 'schedule'])->middleware('throttle:operational-read');
        Route::get('group-registration/{cycle:public_id}', [PublicGroupRegistrationController::class, 'cycle']);
        Route::post('group-registration/{cycle:public_id}/request-otp', [PublicGroupRegistrationController::class, 'requestOtp'])->middleware('throttle:student-otp-request');
        Route::post('group-registration/{cycle:public_id}/verify-otp', [PublicGroupRegistrationController::class, 'verifyOtp'])->middleware('throttle:student-otp-verify');
        Route::post('group-registration/{cycle:public_id}/options', [PublicGroupRegistrationController::class, 'options'])->middleware('throttle:operational-read');
        Route::post('group-registration/{cycle:public_id}/select', [PublicGroupRegistrationController::class, 'select'])->middleware('throttle:operational-read');
        Route::post('group-registration/{cycle:public_id}/withdraw', [PublicGroupRegistrationController::class, 'withdraw'])->middleware('throttle:operational-read');
    });

    // -------------------------------------------------------------------------
    // Phase 3A — Core Domain & People Foundation
    // All routes: auth:sanctum (authentication) + permission:<code> (authorization)
    // -------------------------------------------------------------------------
    Route::middleware('auth:sanctum')->group(function () {

        // Every authenticated account owns one shared professional profile.
        // Role-specific CV/performance pages link to this identity rather than
        // becoming parallel sources for the user's photo and contact details.
        Route::get('profile/me', [UserProfileController::class, 'show']);
        Route::put('profile/me', [UserProfileController::class, 'update']);
        Route::post('profile/me/avatar', [UserProfileController::class, 'uploadAvatar']);
        Route::put('profile/me/password', [UserProfileController::class, 'updatePassword']);

        Route::get('student-schedule-portal', [StudentSchedulePortalController::class, 'show'])
            ->middleware('permission:clinical_schedule.view');
        Route::put('student-schedule-portal', [StudentSchedulePortalController::class, 'update'])
            ->middleware('permission:distribution.student_portal.manage');

        Route::prefix('group-registration-cycles')->group(function () {
            Route::get('/', [GroupRegistrationAdminController::class, 'index'])->middleware('permission:group_registration.view');
            Route::post('/', [GroupRegistrationAdminController::class, 'store'])->middleware('permission:group_registration.manage_groups');
            Route::get('/{cycle}', [GroupRegistrationAdminController::class, 'show'])->middleware('permission:group_registration.view');
            Route::put('/{cycle}', [GroupRegistrationAdminController::class, 'update'])->middleware('permission:group_registration.open_close');
            Route::delete('/{cycle}', [GroupRegistrationAdminController::class, 'destroy'])->middleware('permission:group_registration.manage_groups');
            Route::post('/{cycle}/roster', [GroupRegistrationAdminController::class, 'importRoster'])->middleware('permission:group_registration.manage_roster');
            Route::post('/{cycle}/generate-subgroups', [GroupRegistrationAdminController::class, 'generateSubgroups'])->middleware('permission:group_registration.manage_groups');
            Route::post('/{cycle}/groups/{group}/subgroups', [GroupRegistrationAdminController::class, 'storeSubgroup'])->middleware('permission:group_registration.manage_groups');
            Route::put('/{cycle}/subgroups/{subgroup}', [GroupRegistrationAdminController::class, 'updateSubgroup'])->middleware('permission:group_registration.manage_groups');
            Route::delete('/{cycle}/subgroups/{subgroup}', [GroupRegistrationAdminController::class, 'archiveSubgroup'])->middleware('permission:group_registration.manage_groups');
            Route::put('/{cycle}/students/{student}/assignment', [GroupRegistrationAdminController::class, 'overrideAssignment'])->middleware('permission:group_registration.override');
            Route::get('/{cycle}/export', [GroupRegistrationAdminController::class, 'export'])->middleware('permission:group_registration.export');
        });

        // Academic Years
        Route::prefix('academic-years')->name('academic-years.')->group(function () {
            Route::get('/', [AcademicYearController::class, 'index'])
                ->middleware('permission:academic_years.view')->name('index');
            Route::post('/', [AcademicYearController::class, 'store'])
                ->middleware('permission:academic_years.manage')->name('store');
            Route::get('/{academic_year}', [AcademicYearController::class, 'show'])
                ->middleware('permission:academic_years.view')->name('show');
            Route::put('/{academic_year}', [AcademicYearController::class, 'update'])
                ->middleware('permission:academic_years.manage')->name('update');
        });

        // Departments
        Route::prefix('departments')->name('departments.')->group(function () {
            Route::get('/', [DepartmentController::class, 'index'])
                ->middleware('permission:departments.view')->name('index');
            Route::post('/', [DepartmentController::class, 'store'])
                ->middleware('permission:departments.manage')->name('store');
            Route::get('/{department}', [DepartmentController::class, 'show'])
                ->middleware('permission:departments.view')->name('show');
            Route::put('/{department}', [DepartmentController::class, 'update'])
                ->middleware('permission:departments.manage')->name('update');
        });

        // People (Staff)
        Route::prefix('people')->name('people.')->group(function () {
            Route::get('/', [PersonController::class, 'index'])
                ->middleware('permission:people.view')->name('index');
            Route::post('/', [PersonController::class, 'store'])
                ->middleware('permission:users.manage')->name('store');
            Route::get('/{person}', [PersonController::class, 'show'])
                ->middleware('permission:people.view')->name('show');
            Route::put('/{person}', [PersonController::class, 'update'])
                ->middleware('permission:users.manage')->name('update');
        });

        // Students
        Route::prefix('students')->name('students.')->group(function () {
            Route::get('/', [StudentController::class, 'index'])
                ->middleware('permission:students.view')->name('index');
            Route::get('/main-groups', [StudentController::class, 'mainGroups'])
                ->middleware('permission:students.view')->name('main-groups');
            Route::post('/', [StudentController::class, 'store'])
                ->middleware('permission:students.create')->name('store');
            Route::post('/bulk-import', [StudentController::class, 'bulkImport'])
                ->middleware('permission:students.create')->name('bulk-import');
            Route::post('/bulk-assign-advisor', [StudentController::class, 'bulkAssignAdvisor'])
                ->middleware('permission:advising.assign')
                ->name('bulk-assign-advisor');
            Route::post('/{student}/photo', [StudentController::class, 'uploadPhoto'])
                ->middleware('permission:students.update')->name('photo.store');
            Route::post('/{student}/documents', [StudentController::class, 'uploadDocument'])
                ->middleware('permission:students.update')->name('documents.store');
            Route::get('/{student}/documents/{documentId}', [StudentController::class, 'downloadDocument'])
                ->middleware('permission:students.view')->name('documents.download');
            Route::delete('/{student}/documents/{documentId}', [StudentController::class, 'deleteDocument'])
                ->middleware('permission:students.update')->name('documents.destroy');
            Route::get('/{student}', [StudentController::class, 'show'])
                ->middleware('permission:students.view')->name('show');
            Route::put('/{student}', [StudentController::class, 'update'])
                ->middleware('permission:students.update')->name('update');
            Route::delete('/{student}', [StudentController::class, 'destroy'])
                ->middleware('permission:students.delete')->name('destroy');
        });

        // Student Groups
        Route::prefix('student-groups')->name('student-groups.')->group(function () {
            Route::get('/', [StudentGroupController::class, 'index'])
                ->middleware('permission:groups.view')->name('index');
            Route::post('/', [StudentGroupController::class, 'store'])
                ->middleware('permission:groups.manage')->name('store');
            Route::get('/{student_group}', [StudentGroupController::class, 'show'])
                ->middleware('permission:groups.view')->name('show');
        });

        Route::post('student-group-assignments', [StudentGroupAssignmentController::class, 'store'])
            ->middleware('permission:groups.manage')->name('student-group-assignments.store');

        Route::get('courses', [CourseController::class, 'index'])->middleware('permission:courses.view');
        Route::post('courses', [CourseController::class, 'store'])->middleware('permission:courses.manage');
        Route::post('courses/bulk-import', [CourseController::class, 'bulkImport'])->middleware('permission:courses.manage');
        Route::get('program-outcomes', [ProgramOutcomeController::class, 'index'])->middleware('permission:courses.view');
        Route::get('courses/{course}', [CourseController::class, 'show'])->middleware('permission:courses.view');
        Route::put('courses/{course}', [CourseController::class, 'update'])->middleware('permission:courses.manage');
        Route::delete('courses/{course}', [CourseController::class, 'destroy'])->middleware('permission:courses.manage');
        Route::post('courses/{course}/assessment-components', [CourseController::class, 'addAssessmentComponent'])->middleware('permission:courses.manage');
        Route::put('courses/{course}/assessment-components/{componentId}', [CourseController::class, 'updateAssessmentComponent'])->middleware('permission:courses.manage');
        Route::delete('courses/{course}/assessment-components/{componentId}', [CourseController::class, 'deleteAssessmentComponent'])->middleware('permission:courses.manage');
        Route::post('courses/{course}/learning-outcomes', [CourseController::class, 'addLearningOutcome'])->middleware('permission:courses.manage');
        Route::put('courses/{course}/learning-outcomes/{outcomeId}', [CourseController::class, 'updateLearningOutcome'])->middleware('permission:courses.manage');
        Route::delete('courses/{course}/learning-outcomes/{outcomeId}', [CourseController::class, 'deleteLearningOutcome'])->middleware('permission:courses.manage');
        Route::post('courses/{course}/program-outcome-mappings', [CourseController::class, 'addProgramOutcomeMapping'])->middleware('permission:courses.manage');
        Route::delete('courses/{course}/program-outcome-mappings/{mappingId}', [CourseController::class, 'deleteProgramOutcomeMapping'])->middleware('permission:courses.manage');
        Route::get('courses/{course}/reports', [CourseReportController::class, 'index'])->middleware('permission.any:courses.view,course_report.manage,course_report.approve');
        Route::post('courses/{course}/reports', [CourseReportController::class, 'store'])->middleware('permission:course_report.manage');
        Route::post('courses/{course}/reports/{report}/submit', [CourseReportController::class, 'submit'])->middleware('permission:course_report.manage');
        Route::post('courses/{course}/reports/{report}/approve', [CourseReportController::class, 'approve'])->middleware('permission:course_report.approve');
        Route::post('courses/{course}/reports/{report}/return', [CourseReportController::class, 'returnForRevision'])->middleware('permission:course_report.approve');
        Route::get('study-plans', [StudyPlanController::class, 'index'])->middleware('permission:courses.view');
        Route::get('study-plans/{studyPlan}', [StudyPlanController::class, 'show'])->middleware('permission:courses.view');
        Route::post('study-plans', [StudyPlanController::class, 'store'])->middleware('permission:courses.manage');
        Route::put('study-plans/{studyPlan}', [StudyPlanController::class, 'update'])->middleware('permission:courses.manage');
        Route::delete('study-plans/{studyPlan}', [StudyPlanController::class, 'destroy'])->middleware('permission:courses.manage');
        Route::post('study-plans/{studyPlan}/courses', [StudyPlanController::class, 'addCourse'])->middleware('permission:courses.manage');
        Route::delete('study-plans/{studyPlan}/courses/{courseId}', [StudyPlanController::class, 'removeCourse'])->middleware('permission:courses.manage');
        Route::get('student-course-enrollments', [StudentCourseEnrollmentController::class, 'index'])->middleware('permission:students.view');
        Route::post('student-course-enrollments', [StudentCourseEnrollmentController::class, 'store'])->middleware('permission:courses.manage');
        Route::get('grade-entries', [GradeEntryController::class, 'index'])->middleware('permission:grades.view');
        Route::get('grade-entries/options', [GradeEntryController::class, 'options'])->middleware('permission:grades.view');
        Route::get('grade-entries/roster', [GradeEntryController::class, 'roster'])->middleware('permission:grades.view');
        Route::get('grade-entries/clinical-assessment-summary', [GradeEntryController::class, 'clinicalAssessmentSummary'])->middleware('permission:grades.view');
        Route::post('grade-entries', [GradeEntryController::class, 'store'])->middleware('permission:grades.create');
        Route::post('grade-entries/batch', [GradeEntryController::class, 'batchStore'])->middleware('permission:grades.create');
        Route::post('grade-entries/batch-submit', [GradeEntryController::class, 'batchSubmit'])->middleware('permission:grades.create');
        Route::post('grade-entries/batch-approve', [GradeEntryController::class, 'batchApprove'])->middleware('permission:grades.approve');
        Route::post('grade-entries/batch-return', [GradeEntryController::class, 'batchReturn'])->middleware('permission:grades.approve');
        Route::get('clinical-sessions', [ClinicalSessionController::class, 'index'])->middleware('permission:attendance.view');
        Route::post('clinical-sessions', [ClinicalSessionController::class, 'store'])->middleware('permission:attendance.record');
        Route::get('attendance-records', [AttendanceRecordController::class, 'index'])->middleware('permission:attendance.view');
        Route::post('attendance-records', [AttendanceRecordController::class, 'store'])->middleware('permission:attendance.record');
        Route::get('attendance-warnings', [AttendanceWarningController::class, 'index'])->middleware('permission:attendance.view');
        Route::post('attendance-warnings/send', [AttendanceWarningController::class, 'send'])->middleware(['permission:attendance.view', 'permission:attendance.notify', 'throttle:attendance-notification']);
        Route::get('dashboard/overview', [DashboardOverviewController::class, 'show'])->middleware('throttle:operational-read');
        Route::get('clinical-assessments', [ClinicalAssessmentController::class, 'index'])->middleware('permission:assessment.view');
        Route::get('clinical-assessments-summary', [ClinicalAssessmentController::class, 'summary'])->middleware('permission:assessment.view');
        Route::post('clinical-assessments', [ClinicalAssessmentController::class, 'store'])->middleware('permission:assessment.create');
        Route::post('clinical-assessments/{clinicalAssessment}/submit', [ClinicalAssessmentController::class, 'submit'])->middleware('permission:assessment.submit');
        Route::post('clinical-assessments/{clinicalAssessment}/approve', [ClinicalAssessmentController::class, 'approve'])->middleware('permission:assessment.approve');
        Route::post('clinical-assessment-batches/{batchUuid}/approve', [ClinicalAssessmentController::class, 'approveBatch'])->middleware('permission:assessment.approve');
        Route::post('clinical-assessment-batches/{batchUuid}/return', [ClinicalAssessmentController::class, 'returnBatch'])->middleware('permission:assessment.approve');
        Route::get('advising-overview', [AdvisingRecordController::class, 'overview'])->middleware('permission:advising.view');
        Route::get('advising-records', [AdvisingRecordController::class, 'index'])->middleware('permission:advising.view');
        Route::get('advising-records/{advisingRecord}', [AdvisingRecordController::class, 'show'])->middleware('permission:advising.view');
        Route::post('advising-records', [AdvisingRecordController::class, 'store'])->middleware('permission:advising.manage');
        Route::put('advising-records/{advisingRecord}', [AdvisingRecordController::class, 'update'])->middleware('permission:advising.manage');
        Route::get('correspondence', [CorrespondenceController::class, 'index'])->middleware('permission:correspondence.view');
        Route::get('correspondence/{correspondence}', [CorrespondenceController::class, 'show'])->middleware('permission:correspondence.view');
        Route::post('correspondence', [CorrespondenceController::class, 'store'])->middleware('permission:correspondence.create');
        Route::put('correspondence/{correspondence}', [CorrespondenceController::class, 'update'])->middleware('permission:correspondence.update');
        Route::post('correspondence/{correspondence}/submit', [CorrespondenceController::class, 'submit'])->middleware('permission:correspondence.submit');
        Route::post('correspondence/{correspondence}/close', [CorrespondenceController::class, 'close'])->middleware('permission:correspondence.close');
        Route::post('correspondence/{correspondence}/return', [CorrespondenceController::class, 'returnCorrespondence'])->middleware('permission.any:correspondence.forward,correspondence.approve');
        Route::post('correspondence/{correspondence}/forward', [CorrespondenceController::class, 'forward'])->middleware('permission:correspondence.forward');
        Route::post('correspondence/{correspondence}/approve', [CorrespondenceController::class, 'approve'])->middleware('permission:correspondence.approve');
        Route::post('correspondence/{correspondence}/tasks', [CorrespondenceController::class, 'createTask'])->middleware('permission:tasks.manage');
        Route::post('correspondence/{correspondence}/attachments', [CorrespondenceController::class, 'storeAttachment'])->middleware('permission:correspondence.view');
        Route::post('correspondence/{correspondence}/messages', [CorrespondenceController::class, 'storeMessage'])->middleware('permission:correspondence.view');
        Route::get('correspondence/{correspondence}/attachments/{attachment}/download', [CorrespondenceController::class, 'downloadAttachment'])->middleware('permission:correspondence.view');
        Route::delete('correspondence/{correspondence}/attachments/{attachment}', [CorrespondenceController::class, 'destroyAttachment'])->middleware('permission:correspondence.view');
        Route::get('operational-tasks', [OperationalTaskController::class, 'index'])->middleware('permission:tasks.view');
        Route::post('operational-tasks', [OperationalTaskController::class, 'store'])->middleware('permission:tasks.manage');
        Route::put('operational-tasks/{operationalTask}', [OperationalTaskController::class, 'update'])->middleware('permission.any:tasks.view,tasks.manage');
        Route::delete('operational-tasks/{operationalTask}', [OperationalTaskController::class, 'destroy'])->middleware('permission:tasks.manage');
        Route::get('quality-surveys', [QualitySurveyController::class, 'index'])->middleware('permission:quality.view');
        Route::post('quality-surveys', [QualitySurveyController::class, 'store'])->middleware('permission:quality.manage');
        Route::get('quality-surveys/{qualitySurvey}', [QualitySurveyController::class, 'show'])->middleware('permission:quality.view');
        Route::get('quality-surveys/{qualitySurvey}/responses', [QualitySurveyController::class, 'responses'])->middleware('permission:quality.view');
        Route::post('quality-surveys/{qualitySurvey}/questions', [QualitySurveyController::class, 'storeQuestion'])->middleware('permission:quality.manage');
        Route::post('quality-surveys/{qualitySurvey}/responses', [QualitySurveyController::class, 'storeResponse'])->middleware('permission:quality.manage');
        Route::get('quality-improvement-plans', [QualityImprovementController::class, 'plans'])->middleware('permission:quality.view');
        Route::post('quality-improvement-plans', [QualityImprovementController::class, 'storePlan'])->middleware('permission:quality.manage');
        Route::get('quality-kpis', [QualityImprovementController::class, 'kpis'])->middleware('permission:quality.view');
        Route::post('quality-kpis', [QualityImprovementController::class, 'storeKpi'])->middleware('permission:kpi.manage');
        Route::get('meetings', [MeetingController::class, 'index'])->middleware('permission:meetings.manage');
        Route::post('meetings', [MeetingController::class, 'store'])->middleware('permission:meetings.manage');
        Route::get('meetings/{meeting}', [MeetingController::class, 'show'])->middleware('permission:meetings.manage');
        Route::put('meetings/{meeting}', [MeetingController::class, 'update'])->middleware('permission:meetings.manage');
        Route::post('meetings/{meeting}/status', [MeetingController::class, 'changeStatus'])->middleware('permission:meetings.manage');
        Route::post('meetings/{meeting}/approve', [MeetingController::class, 'approve'])->middleware('permission:meetings.approve_minutes');
        Route::post('meetings/{meeting}/reopen', [MeetingController::class, 'reopen'])->middleware('permission:meetings.approve_minutes');
        Route::post('meetings/{meeting}/actions', [MeetingController::class, 'storeAction'])->middleware('permission:meetings.manage');
        Route::put('meetings/{meeting}/actions/{action}', [MeetingController::class, 'updateAction'])->middleware('permission:meetings.manage');
        Route::delete('meetings/{meeting}/actions/{action}', [MeetingController::class, 'destroyAction'])->middleware('permission:meetings.manage');

        // Department Heads Routes
        Route::get('dept-heads', [DepartmentHeadController::class, 'index'])
            ->middleware('permission.any:people.view,performance.view');
        // ProfileAuthorizationService allows a head to manage their own profile,
        // while people.manage/performance.view govern administrative operations.
        Route::get('dept-heads/{id}', [DepartmentHeadController::class, 'show']);
        Route::put('dept-heads/{id}', [DepartmentHeadController::class, 'update']);
        Route::post('dept-heads/{id}/evaluation', [DepartmentHeadController::class, 'saveEvaluation']);
        Route::post('dept-heads/{id}/weights', [DepartmentHeadController::class, 'saveWeights']);
        Route::post('dept-heads/{id}/overrides', [DepartmentHeadController::class, 'saveOverrides']);
        Route::post('dept-heads/{id}/avatar', [DepartmentHeadController::class, 'uploadAvatar']);
        Route::post('dept-heads/{id}/documents', [DepartmentHeadController::class, 'uploadDocument']);
        Route::get('dept-heads/{id}/documents/{docId}/download', [DepartmentHeadController::class, 'downloadDocument']);
        Route::delete('dept-heads/{id}/documents/{docId}', [DepartmentHeadController::class, 'deleteDocument']);

        // Official annual performance and renewal assessments for current
        // department heads. The department head never receives these grants.
        Route::get('department-head-evaluations', [DepartmentHeadEvaluationController::class, 'index'])
            ->middleware('permission:department_head_evaluations.view');
        Route::get('department-head-evaluations/options', [DepartmentHeadEvaluationController::class, 'options'])
            ->middleware('permission:department_head_evaluations.view');
        Route::post('department-head-evaluations', [DepartmentHeadEvaluationController::class, 'store'])
            ->middleware('permission:department_head_evaluations.create');
        Route::get('department-head-evaluations/{departmentHeadEvaluation}', [DepartmentHeadEvaluationController::class, 'show'])
            ->middleware('permission:department_head_evaluations.view');
        Route::put('department-head-evaluations/{departmentHeadEvaluation}', [DepartmentHeadEvaluationController::class, 'update'])
            ->middleware('permission:department_head_evaluations.create');
        Route::post('department-head-evaluations/{departmentHeadEvaluation}/submit', [DepartmentHeadEvaluationController::class, 'submit'])
            ->middleware('permission:department_head_evaluations.create');
        Route::post('department-head-evaluations/{departmentHeadEvaluation}/approve', [DepartmentHeadEvaluationController::class, 'approve'])
            ->middleware('permission:department_head_evaluations.approve');
        Route::post('department-head-evaluations/{departmentHeadEvaluation}/reopen', [DepartmentHeadEvaluationController::class, 'reopen'])
            ->middleware('permission:department_head_evaluations.approve');

        // Clinical Supervisors Routes
        Route::get('clinical-supervisors', [ClinicalSupervisorController::class, 'index'])
            ->middleware('permission:people.view');
        Route::get('clinical-workforce', [CourseDistributionController::class, 'clinicalWorkforce'])
            ->middleware('permission.any:people.view,training_sites.view');
        Route::post('clinical-workforce/doctors', [CourseDistributionController::class, 'storeDoctor'])
            ->middleware('permission:people.manage');
        Route::put('clinical-workforce/doctors/{user}/hospital', [CourseDistributionController::class, 'assignDoctorHospital'])
            ->middleware('permission:people.manage');
        Route::get('clinical-supervisors/{id}', [ClinicalSupervisorController::class, 'show']);
        Route::put('clinical-supervisors/{id}', [ClinicalSupervisorController::class, 'update']);
        Route::post('clinical-supervisors/{id}/evaluation', [ClinicalSupervisorController::class, 'saveEvaluation']);
        Route::post('clinical-supervisors/{id}/avatar', [ClinicalSupervisorController::class, 'uploadAvatar']);
        Route::post('clinical-supervisors/{id}/documents', [ClinicalSupervisorController::class, 'uploadDocument']);
        Route::get('clinical-supervisors/{id}/documents/{docId}/download', [ClinicalSupervisorController::class, 'downloadDocument']);
        Route::delete('clinical-supervisors/{id}/documents/{docId}', [ClinicalSupervisorController::class, 'deleteDocument']);
        Route::get('academic-calendar-events', [AcademicCalendarEventController::class, 'index'])->middleware('permission:academic_years.view');
        Route::post('academic-calendar-events', [AcademicCalendarEventController::class, 'store'])->middleware('permission:academic_years.manage');
        // Supervisor Annual Workloads
        Route::get('supervisor-annual-workloads', [SupervisorAnnualWorkloadController::class, 'index'])
            ->middleware('permission:people.view');
        Route::post('supervisor-annual-workloads', [SupervisorAnnualWorkloadController::class, 'store'])->middleware('permission:users.manage');
        Route::put('supervisor-annual-workloads/{workload}', [SupervisorAnnualWorkloadController::class, 'update'])->middleware('permission:users.manage');
        Route::post('supervisor-annual-workloads/{workload}/archive', [SupervisorAnnualWorkloadController::class, 'archive'])->middleware('permission:users.manage');

        // Evaluation Form Versions & Items
        Route::get('evaluation-form-reference', [EvaluationFormReferenceController::class, 'index'])->middleware('permission:assessment.view');
        Route::post('evaluation-form-versions', [EvaluationFormReferenceController::class, 'storeVersion'])->middleware('permission:assessment.create');
        Route::put('evaluation-form-versions/{version}', [EvaluationFormReferenceController::class, 'updateVersion'])->middleware('permission:assessment.create');
        Route::post('evaluation-form-versions/{version}/archive', [EvaluationFormReferenceController::class, 'archiveVersion'])->middleware('permission:assessment.create');
        Route::post('evaluation-form-items', [EvaluationFormReferenceController::class, 'storeItem'])->middleware('permission:assessment.create');
        Route::put('evaluation-form-items/{item}', [EvaluationFormReferenceController::class, 'updateItem'])->middleware('permission:assessment.create');
        Route::post('evaluation-form-items/{item}/archive', [EvaluationFormReferenceController::class, 'archiveItem'])->middleware('permission:assessment.create');

        // Research Projects
        Route::get('research-projects', [ResearchProjectController::class, 'index'])->middleware('permission:courses.view');
        Route::post('research-projects', [ResearchProjectController::class, 'store'])->middleware('permission:courses.manage');
        Route::put('research-projects/{researchProject}', [ResearchProjectController::class, 'update'])->middleware('permission:courses.manage');
        Route::post('research-projects/{researchProject}/archive', [ResearchProjectController::class, 'archive'])->middleware('permission:courses.manage');

        // External Electives
        Route::get('external-electives', [ExternalElectiveController::class, 'index'])->middleware('permission:courses.view');
        Route::post('external-electives', [ExternalElectiveController::class, 'store'])->middleware('permission:courses.manage');
        Route::put('external-electives/{externalElective}', [ExternalElectiveController::class, 'update'])->middleware('permission:courses.manage');
        Route::post('external-electives/{externalElective}/archive', [ExternalElectiveController::class, 'archive'])->middleware('permission:courses.manage');

        // Skill Logbook Requirements
        Route::get('skill-logbook-requirements', [SkillLogbookRequirementController::class, 'index'])->middleware('permission:assessment.view');
        Route::post('skill-logbook-requirements', [SkillLogbookRequirementController::class, 'store'])->middleware('permission:assessment.create');
        Route::put('skill-logbook-requirements/{requirement}', [SkillLogbookRequirementController::class, 'update'])->middleware('permission:assessment.create');
        Route::post('skill-logbook-requirements/{requirement}/archive', [SkillLogbookRequirementController::class, 'archive'])->middleware('permission:assessment.create');

        // Weekly Supervisor Allocations
        Route::post('weekly-supervisor-allocations', [StaffAllocationController::class, 'storeAllocation'])->middleware('permission:users.manage');
        Route::put('weekly-supervisor-allocations/{allocation}', [StaffAllocationController::class, 'updateAllocation'])->middleware('permission:users.manage');
        Route::post('weekly-supervisor-allocations/{allocation}/archive', [StaffAllocationController::class, 'archiveAllocation'])->middleware('permission:users.manage');

        // Workflow transitions — Package C
        Route::post('grade-entries/{gradeEntry}/submit', [GradeEntryController::class, 'submit'])->middleware('permission:grades.create');
        Route::post('grade-entries/{gradeEntry}/return', [GradeEntryController::class, 'returnGrade'])->middleware('permission:grades.approve');
        Route::post('grade-entries/{gradeEntry}/approve', [GradeEntryController::class, 'approve'])->middleware('permission:grades.approve');
        Route::post('clinical-assessments/{clinicalAssessment}/return', [ClinicalAssessmentController::class, 'returnAssessment'])->middleware('permission:assessment.approve');
        Route::post('quality-improvement-plans/{plan}/transition', [QualityImprovementController::class, 'transition'])->middleware('permission:quality.manage');

        // Annual Report
        Route::get('annual-report-entries', [AnnualReportEntryController::class, 'index'])->middleware('permission:reports.view');
        Route::get('annual-report-entries/export', [AnnualReportEntryController::class, 'export'])->middleware('permission:reports.export');

        // Unified branded report center
        Route::get('report-center/summary', [ReportCenterController::class, 'summary'])->middleware('permission:reports.view');
        Route::get('report-center/{report}/preview', [ReportCenterController::class, 'preview'])->middleware('permission:reports.view');
        Route::get('report-center/{report}/export', [ReportCenterController::class, 'export'])->middleware(['permission:reports.export', 'throttle:export']);

        // Staff Allocations
        Route::get('staff-allocations', [StaffAllocationController::class, 'index'])->middleware('permission:people.view');

        // Audit Logs — Package D
        Route::get('audit-logs', [AuditLogController::class, 'index'])->middleware('permission:audit.view');
        Route::get('audit-logs/export', [AuditLogController::class, 'export'])->middleware('permission:reports.export');
        Route::get('audit-logs/{auditLog}', [AuditLogController::class, 'show'])->middleware('permission:audit.view');

        // CSV Exports — Package E
        Route::prefix('export')->name('export.')->middleware(['permission:reports.export', 'throttle:export'])->group(function () {
            Route::get('students', [CsvExportController::class, 'students'])->name('students');
            Route::get('staff', [CsvExportController::class, 'staff'])->name('staff');
            Route::get('attendance', [CsvExportController::class, 'attendance'])->name('attendance');
            Route::get('grades', [CsvExportController::class, 'grades'])->name('grades');
            Route::get('assessments', [CsvExportController::class, 'assessments'])->name('assessments');
            Route::get('correspondence', [CsvExportController::class, 'correspondence'])->name('correspondence');
            Route::get('tasks', [CsvExportController::class, 'tasks'])->name('tasks');
            Route::get('quality', [CsvExportController::class, 'quality'])->name('quality');
            Route::get('workloads', [CsvExportController::class, 'workloads'])->name('workloads');
            Route::get('allocations', [CsvExportController::class, 'allocations'])->name('allocations');
        });

        // Training Sites
        Route::prefix('training-sites')->name('training-sites.')->group(function () {
            Route::get('/', [TrainingSiteController::class, 'index'])
                ->middleware('permission:training_sites.view')->name('index');
            Route::post('/', [TrainingSiteController::class, 'store'])
                ->middleware('permission:training_sites.manage')->name('store');
            Route::get('/{training_site}', [TrainingSiteController::class, 'show'])
                ->middleware('permission:training_sites.view')->name('show');
            Route::put('/{training_site}', [TrainingSiteController::class, 'update'])
                ->middleware('permission:training_sites.manage')->name('update');
        });

        // Partnerships
        Route::prefix('partnerships')->name('partnerships.')->group(function () {
            Route::get('/', [PartnershipController::class, 'index'])
                ->middleware('permission:partnerships.view')->name('index');
            Route::post('/', [PartnershipController::class, 'store'])
                ->middleware('permission:partnerships.manage')->name('store');
            Route::get('/{partnership}', [PartnershipController::class, 'show'])
                ->middleware('permission:partnerships.view')->name('show');
            Route::put('/{partnership}', [PartnershipController::class, 'update'])
                ->middleware('permission:partnerships.manage')->name('update');
        });
        // ---------------------------------------------------------------------
        // Rotations (Phase 3B-1)
        // ---------------------------------------------------------------------
        Route::post('rotations/{rotation}/validate-distribution', [RotationController::class, 'validateDistribution'])
            ->middleware('permission:distribution.validate')
            ->name('rotations.validate-distribution');

        Route::get('rotations/{rotation}/distribution/candidates', [RotationController::class, 'generateCandidates'])
            ->middleware('permission:distribution.validate')
            ->name('rotations.distribution.candidates');

        Route::post('rotations/{rotation}/distribution/generate', [RotationController::class, 'generateDistribution'])
            ->middleware('permission:distribution.generate')
            ->name('rotations.distribution.generate');

        // Distribution Manual Management
        Route::get('distribution-versions/{version}/assignments', [DistributionAssignmentController::class, 'index'])
            ->middleware('permission:distribution.view')
            ->name('distribution-versions.assignments.index');

        Route::post('distribution-versions/{version}/assignments', [DistributionAssignmentController::class, 'store'])
            ->middleware('permission:distribution.create')
            ->name('distribution-versions.assignments.store');

        Route::put('distribution-versions/{version}/assignments/{assignment}', [DistributionAssignmentController::class, 'update'])
            ->middleware('permission:distribution.update')
            ->name('distribution-versions.assignments.update')
            ->scopeBindings();

        Route::delete('distribution-versions/{version}/assignments/{assignment}', [DistributionAssignmentController::class, 'destroy'])
            ->middleware('permission:distribution.delete')
            ->name('distribution-versions.assignments.destroy')
            ->scopeBindings();

        // Subgroup-first workbench. Student membership remains authoritative in
        // the Student Groups module; these endpoints only allocate whole subgroups.
        Route::get('distribution-versions/{version}/subgroups', [DistributionSubgroupController::class, 'index'])
            ->middleware('permission:distribution.view')
            ->name('distribution-versions.subgroups.index');

        Route::post('distribution-versions/{version}/subgroups/{subgroup}/assignment', [DistributionSubgroupController::class, 'store'])
            ->middleware('permission:distribution.create')
            ->name('distribution-versions.subgroups.assignment.store');

        Route::put('distribution-versions/{version}/subgroups/{subgroup}/assignment', [DistributionSubgroupController::class, 'update'])
            ->middleware('permission:distribution.update')
            ->name('distribution-versions.subgroups.assignment.update');

        Route::delete('distribution-versions/{version}/subgroups/{subgroup}/assignment', [DistributionSubgroupController::class, 'destroy'])
            ->middleware('permission.any:distribution.delete,distribution.update')
            ->name('distribution-versions.subgroups.assignment.destroy');

        // Distribution Versions Workbench Read APIs
        Route::get('distribution-versions', [DistributionVersionController::class, 'index'])
            ->middleware('permission:distribution.view')
            ->name('distribution-versions.index');

        Route::post('distribution-versions', [DistributionVersionController::class, 'store'])
            ->middleware('permission:distribution.create')
            ->name('distribution-versions.store');

        Route::get('distribution-versions/{version}', [DistributionVersionController::class, 'show'])
            ->middleware('permission:distribution.view')
            ->name('distribution-versions.show');

        Route::get('distribution-versions/{version}/audit-logs', [DistributionVersionController::class, 'auditLogs'])
            ->middleware('permission:distribution.view')
            ->name('distribution-versions.audit-logs');

        Route::get('distribution-versions/{version}/unassigned', [DistributionVersionController::class, 'unassigned'])
            ->middleware('permission:distribution.view')
            ->name('distribution-versions.unassigned');

        Route::get('distribution-versions/{version}/conflicts', [DistributionVersionController::class, 'conflicts'])
            ->middleware('permission:distribution.view')
            ->name('distribution-versions.conflicts');

        Route::get('distribution-versions/{version}/options', [DistributionVersionController::class, 'options'])
            ->middleware('permission:distribution.view')
            ->name('distribution-versions.options');

        // Distribution Version Lifecycle & Comparison
        Route::post('distribution-versions/{version}/approve', [DistributionApprovalController::class, 'store'])
            ->middleware('permission:distribution.approve')
            ->name('distribution-versions.approve');

        Route::post('distribution-versions/{version}/publish', [DistributionPublicationController::class, 'store'])
            ->middleware('permission:distribution.publish')
            ->name('distribution-versions.publish');

        Route::post('course-distribution/versions/{version}/revise', [CourseDistributionController::class, 'reviseSchedule'])
            ->middleware('permission:distribution.revise')->name('course-distribution.versions.revise');
        Route::post('course-distribution/versions/{version}/unpublish', [CourseDistributionController::class, 'unpublishSchedule'])
            ->middleware('permission:distribution.unpublish')->name('course-distribution.versions.unpublish');
        Route::delete('course-distribution/rotations/{rotation}', [CourseDistributionController::class, 'destroySchedule'])
            ->middleware('permission:distribution.delete')->name('course-distribution.schedules.destroy');

        Route::get('distribution-versions/{version}/compare/{otherVersion}', [DistributionVersionComparisonController::class, 'show'])
            ->middleware('permission:distribution.view')
            ->name('distribution-versions.compare');

        // Phase 5B — Operational Clinical Schedule APIs
        Route::get('operational/clinical-schedule', [OperationalDistributionController::class, 'administrativeSchedule'])
            ->middleware('permission:clinical_schedule.view')
            ->name('operational.clinical-schedule');
        Route::get('operational/clinical-schedule-options', [OperationalDistributionController::class, 'clinicalScheduleOptions'])
            ->middleware('permission:clinical_schedule.view')
            ->name('operational.clinical-schedule-options');

        Route::get('users/lookup', [UserController::class, 'lookup'])
            ->middleware('permission.any:people.view,students.view,advising.assign,correspondence.view,tasks.manage,meetings.manage');

        // Keep static user paths before apiResource('users') so "rta-list"
        // can never be consumed by the /users/{user} model-binding route.
        Route::get('users/rta-list', [UserController::class, 'rtaList'])
            ->middleware('permission:rta_assignments.manage');
        Route::put('users/{user}/assign-levels', [UserController::class, 'assignLevels'])
            ->middleware('permission:rta_assignments.manage');

        // Technical administration. These endpoints intentionally live only
        // under /admin; the UI routes use the same canonical API namespace.
        Route::prefix('admin')->name('admin.')->group(function () {
            Route::get('health', [SystemAdminController::class, 'health'])
                ->middleware('permission:settings.manage')->name('health');
            Route::get('sessions', [SystemAdminController::class, 'sessions'])
                ->middleware('permission:users.manage')->name('sessions.index');
            Route::post('sessions/{user}/revoke', [SystemAdminController::class, 'revokeSession'])
                ->middleware('permission:users.manage')->name('sessions.revoke');
            Route::get('permissions/matrix', [SystemAdminController::class, 'permissionMatrix'])
                ->middleware('permission:roles.manage')->name('permissions.matrix');
            Route::post('permissions/toggle', [SystemAdminController::class, 'togglePermission'])
                ->middleware('permission:roles.manage')->name('permissions.toggle');
            Route::get('settings', [SystemAdminController::class, 'getSettings'])
                ->middleware('permission:settings.manage')->name('settings.show');
            Route::post('settings', [SystemAdminController::class, 'updateSettings'])
                ->middleware('permission:settings.manage')->name('settings.update');
        });

        Route::prefix('users')->name('users.')->middleware(['permission:users.manage'])->group(function () {
            // Static routes must precede /{user} routes to avoid model-binding collisions.
            Route::get('roles', [UserController::class, 'getRoles'])->name('roles');
            Route::get('departments-for-assignment', [UserController::class, 'departmentsForAssignment'])
                ->name('departments-for-assignment');
            Route::post('{user}/toggle', [UserController::class, 'toggleActive'])->name('toggle');
            Route::post('{user}/reset-password', [UserController::class, 'resetPassword'])->name('reset-password');
        });

        Route::middleware(['permission:users.manage'])->group(function () {
            Route::apiResource('users', UserController::class);

            // Admin Departments Management
            Route::get('departments-manage/candidates', [AdminDepartmentController::class, 'candidates']);
            Route::post('departments-manage/{department}/assign-leaders', [AdminDepartmentController::class, 'assignLeaders']);
            Route::post('departments-manage/{department}/toggle', [AdminDepartmentController::class, 'toggle']);
            Route::apiResource('departments-manage', AdminDepartmentController::class)->parameters(['departments-manage' => 'department']);

        });

        // Phase 5A — Core Operational Read APIs
        Route::get('rotations/{rotation}/current-distribution', [OperationalDistributionController::class, 'currentDistribution'])
            ->middleware('permission:distribution.view')
            ->name('rotations.current-distribution');

        Route::get('rotations/{rotation}/current-distribution/summary', [OperationalDistributionController::class, 'currentDistributionSummary'])
            ->middleware('permission:distribution.view')
            ->name('rotations.current-distribution.summary');

        Route::get('rotations/{rotation}/current-distribution/unassigned', [OperationalDistributionController::class, 'unassignedStudents'])
            ->middleware('permission:distribution.view')
            ->name('rotations.current-distribution.unassigned');

        Route::get('operational/distribution-payload/{key?}', [OperationalDistributionController::class, 'getDistributionPayload'])
            ->middleware('permission.any:distribution.view,grades.view,assessment.view,advising.view')
            ->where('key', '.*');
        Route::post('operational/distribution-payload', [OperationalDistributionController::class, 'saveDistributionPayload'])
            ->middleware('permission.any:distribution.update,grades.create,assessment.create,attendance.record,advising.manage');

        Route::get('students/{student}/current-clinical-schedule', [OperationalDistributionController::class, 'studentSchedule'])
            ->middleware('permission:distribution.view')
            ->name('students.current-clinical-schedule');

        Route::get('supervisors/{person}/current-clinical-schedule', [OperationalDistributionController::class, 'supervisorSchedule'])
            ->middleware('permission:distribution.view')
            ->name('supervisors.current-clinical-schedule');

        Route::get('departments/{department}/current-distribution', [OperationalDistributionController::class, 'departmentDistribution'])
            ->middleware('permission:distribution.view')
            ->name('departments.current-distribution');

        Route::get('training-sites/{trainingSite}/current-distribution', [OperationalDistributionController::class, 'trainingSiteDistribution'])
            ->middleware('permission:distribution.view')
            ->name('training-sites.current-distribution');

        // Phase 5D — Department & Training Site Rosters
        Route::get('departments/{department}/current-distribution/roster', [DepartmentRosterController::class, 'roster'])
            ->middleware('permission:distribution.view')
            ->name('departments.current-distribution.roster');

        Route::get('departments/{department}/current-distribution/summary', [DepartmentRosterController::class, 'summary'])
            ->middleware('permission:distribution.view')
            ->name('departments.current-distribution.summary');

        Route::get('training-sites/{trainingSite}/current-distribution/roster', [TrainingSiteRosterController::class, 'roster'])
            ->middleware('permission:distribution.view')
            ->name('training-sites.current-distribution.roster');

        Route::get('training-sites/{trainingSite}/current-distribution/summary', [TrainingSiteRosterController::class, 'summary'])
            ->middleware('permission:distribution.view')
            ->name('training-sites.current-distribution.summary');

        // Phase 6B — Clinical Operations Dashboard
        Route::get('operational/dashboard/summary', [OperationalDashboardController::class, 'summary'])
            ->middleware(['permission:distribution.view', 'throttle:operational-read'])
            ->name('operational.dashboard.summary');

        // Phase 5E — Operational Reports (Rate limited by export limiter)
        Route::prefix('operational/reports')->name('operational.reports.')->middleware(['permission:distribution.view', 'throttle:export'])->group(function () {
            Route::get('students', [OperationalReportController::class, 'studentDistribution'])->name('students');
            Route::get('departments/{department}', [OperationalReportController::class, 'departmentDistribution'])->name('departments');
            Route::get('sites', [OperationalReportController::class, 'trainingSiteCapacity'])->name('sites');
            Route::get('supervisors/{supervisor}', [OperationalReportController::class, 'supervisorDistribution'])->name('supervisors');
            Route::get('unassigned', [OperationalReportController::class, 'unassignedStudents'])->name('unassigned');
        });

        // Phase 5C — Post-Publication Supervisor Management & Supervisor Portal
        // PUT: reassign supervisor on a published assignment (placement immutable, only supervisor_id changes)
        Route::put('operational/assignments/{assignment}/supervisor', [SupervisorController::class, 'reassign'])
            ->middleware('permission:distribution.update')
            ->name('operational.assignments.supervisor.reassign');

        // GET: authenticated user's own supervisor portal view (my assigned students in current published)
        Route::get('operational/my-supervisor-assignments', [SupervisorController::class, 'myAssignments'])
            ->middleware('permission.any:supervisor.workspace.view,distribution.view')
            ->name('operational.my-supervisor-assignments');

        Route::get('operational/my-supervisor-workspace', [SupervisorController::class, 'workspace'])
            ->middleware('permission:supervisor.workspace.view')
            ->name('operational.my-supervisor-workspace');
        Route::post('operational/my-supervisor-attendance', [SupervisorController::class, 'recordAttendance'])
            ->middleware('permission:attendance.record')
            ->name('operational.my-supervisor-attendance');
        Route::post('operational/my-supervisor-assessments', [SupervisorController::class, 'storeAssessment'])
            ->middleware('permission:assessment.create')
            ->name('operational.my-supervisor-assessments');
        Route::post('operational/my-supervisor-assessment-batches', [SupervisorController::class, 'storeAssessmentBatch'])
            ->middleware('permission:assessment.create')
            ->name('operational.my-supervisor-assessment-batches');

        // GET: admin view of any supervisor's current assignments
        Route::get('operational/supervisors/{person}/assignments', [SupervisorController::class, 'supervisorAssignments'])
            ->middleware('permission:distribution.view')
            ->name('operational.supervisors.assignments');

        Route::get('rotations/setup-options', [RotationController::class, 'setupOptions'])
            ->middleware('permission:rotations.create')
            ->name('rotations.setup-options');

        Route::prefix('course-distribution')->name('course-distribution.')->group(function () {
            Route::get('options', [CourseDistributionController::class, 'options'])
                ->middleware('permission:distribution.view')->name('options');
            Route::get('schedule', [CourseDistributionController::class, 'schedule'])
                ->middleware('permission:distribution.view')->name('schedule');
            Route::post('schedules', [CourseDistributionController::class, 'createSchedule'])
                ->middleware('permission:rotations.create')->name('schedules.store');
            Route::put('versions/{version}/cell', [CourseDistributionController::class, 'assignCell'])
                ->middleware('permission:distribution.update')->name('cells.update');
            Route::delete('versions/{version}/cell', [CourseDistributionController::class, 'clearCell'])
                ->middleware('permission:distribution.update')->name('cells.destroy');
            Route::post('versions/{version}/rows', [CourseDistributionController::class, 'storeScheduleRow'])
                ->middleware('permission:distribution.schedule_rows.manage')->name('rows.store');
            Route::put('versions/{version}/rows/{row}', [CourseDistributionController::class, 'updateScheduleRow'])
                ->middleware('permission:distribution.schedule_rows.manage')->name('rows.update');
            Route::delete('versions/{version}/rows/{row}', [CourseDistributionController::class, 'destroyScheduleRow'])
                ->middleware('permission:distribution.schedule_rows.manage')->name('rows.destroy');
            Route::post('doctors', [CourseDistributionController::class, 'storeDoctor'])
                ->middleware('permission:people.manage')->name('doctors.store');
            Route::put('doctors/{user}/hospital', [CourseDistributionController::class, 'assignDoctorHospital'])
                ->middleware('permission:people.manage')->name('doctors.hospital.update');
        });

        Route::apiResource('rotations', RotationController::class)
            // Distribution users need the reference list to open the
            // workbench, but they still cannot manage rotation settings.
            ->middlewareFor('index', 'permission.any:rotations.view,distribution.view')
            ->middlewareFor('show', 'permission:rotations.view')
            ->middlewareFor('store', 'permission:rotations.create')
            ->middlewareFor('update', 'permission:rotations.update')
            ->middlewareFor('destroy', 'permission:rotations.delete');

    });
});

<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

/**
 * The 53 permissions, verbatim from
 * Clinical_Department_Permission_Matrix_Workflows_v1.xlsx (`Permissions`
 * sheet) — code/module/action columns copied exactly; description_key
 * points at frontend/src/i18n/locales/{en,ar}.ts (Prompt 02 §7: no
 * hardcoded label text in the database). Not invented: Prompt 02 §9
 * explicitly requires using the approved document's exact list rather than
 * guessing a permission set from imagination.
 *
 * NOTE: this does NOT seed role_permissions (which role gets which
 * permission) — see RolePermissionSeeder.php's own doc comment for why
 * that is deliberately minimal in this phase.
 */
class PermissionSeeder extends Seeder
{
    public function run(): void
    {
        $permissions = [
            ['code' => 'students.view', 'module' => 'Students', 'action' => 'VIEW', 'description_key' => 'permissions.students_view.description'],
            ['code' => 'students.create', 'module' => 'Students', 'action' => 'CREATE', 'description_key' => 'permissions.students_create.description'],
            ['code' => 'students.update', 'module' => 'Students', 'action' => 'UPDATE', 'description_key' => 'permissions.students_update.description'],
            ['code' => 'students.delete', 'module' => 'Students', 'action' => 'DELETE', 'description_key' => 'permissions.students_delete.description'],
            ['code' => 'students.export', 'module' => 'Students', 'action' => 'EXPORT', 'description_key' => 'permissions.students_export.description'],
            ['code' => 'grades.view', 'module' => 'Grades', 'action' => 'VIEW', 'description_key' => 'permissions.grades_view.description'],
            ['code' => 'grades.create', 'module' => 'Grades', 'action' => 'CREATE', 'description_key' => 'permissions.grades_create.description'],
            ['code' => 'grades.update', 'module' => 'Grades', 'action' => 'UPDATE', 'description_key' => 'permissions.grades_update.description'],
            ['code' => 'grades.lock', 'module' => 'Grades', 'action' => 'LOCK', 'description_key' => 'permissions.grades_lock.description'],
            ['code' => 'grades.approve', 'module' => 'Grades', 'action' => 'APPROVE', 'description_key' => 'permissions.grades_approve.description'],
            ['code' => 'grades.publish', 'module' => 'Grades', 'action' => 'PUBLISH', 'description_key' => 'permissions.grades_publish.description'],
            ['code' => 'distribution.view', 'module' => 'Distribution', 'action' => 'VIEW', 'description_key' => 'permissions.distribution_view.description'],
            ['code' => 'clinical_schedule.view', 'module' => 'Distribution', 'action' => 'VIEW_CLINICAL_SCHEDULE', 'description_key' => 'permissions.clinical_schedule_view.description'],
            ['code' => 'distribution.create', 'module' => 'Distribution', 'action' => 'CREATE', 'description_key' => 'permissions.distribution_create.description'],
            ['code' => 'distribution.generate', 'module' => 'Distribution', 'action' => 'GENERATE', 'description_key' => 'permissions.distribution_generate.description'],
            ['code' => 'distribution.update', 'module' => 'Distribution', 'action' => 'UPDATE', 'description_key' => 'permissions.distribution_update.description'],
            ['code' => 'distribution.schedule_rows.manage', 'module' => 'Distribution', 'action' => 'MANAGE_SCHEDULE_ROWS', 'description_key' => 'permissions.distribution_schedule_rows_manage.description'],
            ['code' => 'distribution.student_portal.manage', 'module' => 'Distribution', 'action' => 'MANAGE_STUDENT_PORTAL', 'description_key' => 'permissions.distribution_student_portal_manage.description'],
            ['code' => 'distribution.validate', 'module' => 'Distribution', 'action' => 'VALIDATE', 'description_key' => 'permissions.distribution_validate.description'],
            ['code' => 'distribution.approve', 'module' => 'Distribution', 'action' => 'APPROVE', 'description_key' => 'permissions.distribution_approve.description'],
            ['code' => 'distribution.publish', 'module' => 'Distribution', 'action' => 'PUBLISH', 'description_key' => 'permissions.distribution_publish.description'],
            ['code' => 'distribution.delete', 'module' => 'Distribution', 'action' => 'DELETE', 'description_key' => 'permissions.distribution_delete.description'],
            ['code' => 'distribution.override', 'module' => 'Distribution', 'action' => 'OVERRIDE', 'description_key' => 'permissions.distribution_override.description'],
            ['code' => 'attendance.view', 'module' => 'Attendance', 'action' => 'VIEW', 'description_key' => 'permissions.attendance_view.description'],
            ['code' => 'attendance.record', 'module' => 'Attendance', 'action' => 'RECORD', 'description_key' => 'permissions.attendance_record.description'],
            ['code' => 'attendance.excuse', 'module' => 'Attendance', 'action' => 'EXCUSE', 'description_key' => 'permissions.attendance_excuse.description'],
            ['code' => 'assessment.view', 'module' => 'Assessment', 'action' => 'VIEW', 'description_key' => 'permissions.assessment_view.description'],
            ['code' => 'assessment.create', 'module' => 'Assessment', 'action' => 'CREATE', 'description_key' => 'permissions.assessment_create.description'],
            ['code' => 'assessment.submit', 'module' => 'Assessment', 'action' => 'SUBMIT', 'description_key' => 'permissions.assessment_submit.description'],
            ['code' => 'assessment.approve', 'module' => 'Assessment', 'action' => 'APPROVE', 'description_key' => 'permissions.assessment_approve.description'],
            ['code' => 'supervisor.workspace.view', 'module' => 'Assessment', 'action' => 'VIEW_OWN_WORKSPACE', 'description_key' => 'permissions.supervisor_workspace_view.description'],
            ['code' => 'courses.view', 'module' => 'Courses', 'action' => 'VIEW', 'description_key' => 'permissions.courses_view.description'],
            ['code' => 'courses.manage', 'module' => 'Courses', 'action' => 'MANAGE', 'description_key' => 'permissions.courses_manage.description'],
            ['code' => 'course_report.manage', 'module' => 'Course Reports', 'action' => 'MANAGE', 'description_key' => 'permissions.course_report_manage.description'],
            ['code' => 'course_report.approve', 'module' => 'Course Reports', 'action' => 'APPROVE', 'description_key' => 'permissions.course_report_approve.description'],
            ['code' => 'advising.view', 'module' => 'Advising', 'action' => 'VIEW', 'description_key' => 'permissions.advising_view.description'],
            ['code' => 'advising.manage', 'module' => 'Advising', 'action' => 'MANAGE', 'description_key' => 'permissions.advising_manage.description'],
            ['code' => 'advising.export_pdf', 'module' => 'Advising', 'action' => 'EXPORT_PDF', 'description_key' => 'permissions.advising_export_pdf.description'],
            ['code' => 'quality.manage', 'module' => 'Quality', 'action' => 'MANAGE', 'description_key' => 'permissions.quality_manage.description'],
            ['code' => 'quality.view', 'module' => 'Quality', 'action' => 'VIEW', 'description_key' => 'permissions.quality_view.description'],
            ['code' => 'kpi.manage', 'module' => 'KPIs', 'action' => 'MANAGE', 'description_key' => 'permissions.kpi_manage.description'],
            ['code' => 'performance.view', 'module' => 'Performance', 'action' => 'VIEW', 'description_key' => 'permissions.performance_view.description'],
            ['code' => 'correspondence.view', 'module' => 'Correspondence', 'action' => 'VIEW', 'description_key' => 'permissions.correspondence_view.description'],
            ['code' => 'correspondence.create', 'module' => 'Correspondence', 'action' => 'CREATE', 'description_key' => 'permissions.correspondence_create.description'],
            ['code' => 'correspondence.update', 'module' => 'Correspondence', 'action' => 'UPDATE', 'description_key' => 'permissions.correspondence_update.description'],
            ['code' => 'correspondence.submit', 'module' => 'Correspondence', 'action' => 'SUBMIT', 'description_key' => 'permissions.correspondence_submit.description'],
            ['code' => 'correspondence.forward', 'module' => 'Correspondence', 'action' => 'FORWARD', 'description_key' => 'permissions.correspondence_forward.description'],
            ['code' => 'correspondence.approve', 'module' => 'Correspondence', 'action' => 'APPROVE', 'description_key' => 'permissions.correspondence_approve.description'],
            ['code' => 'correspondence.close', 'module' => 'Correspondence', 'action' => 'CLOSE', 'description_key' => 'permissions.correspondence_close.description'],
            ['code' => 'meetings.manage', 'module' => 'Meetings', 'action' => 'MANAGE', 'description_key' => 'permissions.meetings_manage.description'],
            ['code' => 'meetings.approve_minutes', 'module' => 'Meetings', 'action' => 'APPROVE', 'description_key' => 'permissions.meetings_approve_minutes.description'],
            ['code' => 'tasks.view', 'module' => 'Tasks', 'action' => 'VIEW', 'description_key' => 'permissions.tasks_view.description'],
            ['code' => 'tasks.manage', 'module' => 'Tasks', 'action' => 'MANAGE', 'description_key' => 'permissions.tasks_manage.description'],
            ['code' => 'reports.view', 'module' => 'Reports', 'action' => 'VIEW', 'description_key' => 'permissions.reports_view.description'],
            ['code' => 'reports.export', 'module' => 'Reports', 'action' => 'EXPORT', 'description_key' => 'permissions.reports_export.description'],
            ['code' => 'users.manage', 'module' => 'Security', 'action' => 'MANAGE_USERS', 'description_key' => 'permissions.users_manage.description'],
            ['code' => 'roles.manage', 'module' => 'Security', 'action' => 'MANAGE_ROLES', 'description_key' => 'permissions.roles_manage.description'],
            ['code' => 'audit.view', 'module' => 'Security', 'action' => 'VIEW_AUDIT', 'description_key' => 'permissions.audit_view.description'],
            ['code' => 'settings.manage', 'module' => 'System', 'action' => 'MANAGE_SETTINGS', 'description_key' => 'permissions.settings_manage.description'],
        ];

        foreach ($permissions as $permission) {
            Permission::updateOrCreate(['code' => $permission['code']], $permission);
        }
    }
}

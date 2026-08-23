<?php

use Illuminate\Database\Migrations\Migration;
use App\Models\Role;
use App\Models\Permission;

return new class extends Migration
{
    public function up(): void
    {
        // 1. All Standard Permissions Mapping
        $rolePermissionMap = [
            // مدير النظام التقني
            'SYS_ADMIN' => [
                'users.view', 'users.manage', 'roles.manage', 'audit.view', 'settings.manage',
                'academic_years.view', 'academic_years.manage', 'reports.view', 'reports.export'
            ],

            // مدير الدائرة السريرية
            'CLINICAL_DIRECTOR' => [
                'people.view', 'people.manage', 'departments.view', 'departments.manage',
                'students.view', 'students.create', 'students.update', 'students.export',
                'grades.view', 'grades.create', 'grades.update', 'grades.lock', 'grades.approve', 'grades.publish',
                'distribution.view', 'distribution.create', 'distribution.generate', 'distribution.update', 'distribution.validate', 'distribution.approve', 'distribution.publish', 'distribution.override',
                'rotations.view', 'rotations.create', 'rotations.update',
                'courses.view', 'courses.manage', 'course_report.manage', 'course_report.approve',
                'assessment.view', 'assessment.approve',
                'attendance.view', 'attendance.excuse',
                'advising.view', 'advising.export_pdf',
                'quality.view', 'kpi.manage', 'performance.view',
                'reports.view', 'reports.export',
                'correspondence.view', 'correspondence.create', 'correspondence.update', 'correspondence.submit', 'correspondence.forward', 'correspondence.approve', 'correspondence.close',
                'meetings.manage', 'meetings.approve_minutes',
                'tasks.view', 'tasks.manage',
                'academic_years.view', 'academic_years.manage',
                'groups.view', 'groups.manage',
                'training_sites.view', 'training_sites.manage',
                'partnerships.view', 'partnerships.manage'
            ],

            // عميد الكلية
            'DEAN' => [
                'people.view', 'people.manage', 'departments.view',
                'students.view', 'students.export',
                'grades.view', 'grades.approve', 'grades.publish',
                'distribution.view', 'distribution.publish',
                'rotations.view',
                'courses.view', 'course_report.approve',
                'assessment.view', 'assessment.approve',
                'attendance.view',
                'advising.view',
                'quality.view', 'kpi.manage', 'performance.view',
                'reports.view', 'reports.export',
                'correspondence.view', 'correspondence.create', 'correspondence.approve', 'correspondence.close',
                'meetings.manage', 'meetings.approve_minutes',
                'tasks.view', 'tasks.manage',
                'academic_years.view', 'academic_years.manage',
                'training_sites.view', 'partnerships.view'
            ],

            // نائب العميد
            'VICE_DEAN' => [
                'people.view', 'people.manage', 'departments.view',
                'students.view', 'students.export',
                'grades.view', 'grades.approve', 'grades.publish',
                'distribution.view', 'distribution.publish',
                'rotations.view',
                'courses.view', 'course_report.approve',
                'assessment.view', 'assessment.approve',
                'attendance.view',
                'advising.view',
                'quality.view', 'kpi.manage', 'performance.view',
                'reports.view', 'reports.export',
                'correspondence.view', 'correspondence.create', 'correspondence.approve', 'correspondence.close',
                'meetings.manage', 'meetings.approve_minutes',
                'tasks.view', 'tasks.manage',
                'academic_years.view', 'academic_years.manage',
                'training_sites.view', 'partnerships.view'
            ],

            // رئيس القسم الأكاديمي
            'DEPARTMENT_HEAD' => [
                'people.view', 'departments.view',
                'students.view', 'students.export',
                'grades.view', 'grades.create', 'grades.update', 'grades.approve',
                'distribution.view', 'rotations.view',
                'courses.view', 'courses.manage', 'course_report.manage',
                'assessment.view', 'assessment.approve',
                'attendance.view', 'attendance.record', 'attendance.excuse',
                'advising.view',
                'reports.view', 'reports.export',
                'correspondence.view', 'correspondence.create', 'correspondence.submit',
                'meetings.manage', 'meetings.approve_minutes',
                'tasks.view', 'tasks.manage',
                'groups.view', 'groups.manage'
            ],

            // المشرف السريري
            'CLINICAL_SUPERVISOR' => [
                'students.view',
                'assessment.view', 'assessment.create', 'assessment.submit',
                'attendance.view', 'attendance.record',
                'advising.view', 'advising.manage',
                'correspondence.view', 'correspondence.create',
                'tasks.view'
            ],

            // مساعد التدريب السريري
            'RTA' => [
                'students.view',
                'grades.view', 'grades.create', 'grades.update',
                'distribution.view', 'rotations.view',
                'attendance.view', 'attendance.record',
                'correspondence.view',
                'tasks.view'
            ],

            // المرشد الأكاديمي
            'ACADEMIC_ADVISOR' => [
                'students.view',
                'grades.view',
                'advising.view', 'advising.manage', 'advising.export_pdf',
                'correspondence.view',
                'tasks.view'
            ],

            // مسؤول الجودة والاعتماد
            'QUALITY' => [
                'quality.view', 'quality.manage',
                'kpi.manage', 'performance.view',
                'reports.view', 'reports.export',
                'correspondence.view',
                'tasks.view'
            ],

            // مساعد إداري
            'ADMIN_ASSISTANT' => [
                'students.view', 'people.view',
                'correspondence.view', 'correspondence.create', 'correspondence.update', 'correspondence.forward', 'correspondence.close',
                'meetings.manage',
                'tasks.view', 'tasks.manage',
                'academic_years.view',
                'reports.view'
            ]
        ];

        // Apply clean mappings
        foreach ($rolePermissionMap as $roleCode => $permCodes) {
            $role = Role::where('code', $roleCode)->first();
            if (!$role) continue;

            $permIds = Permission::whereIn('code', $permCodes)->pluck('id')->toArray();
            
            // Sync permissions for this role
            $syncData = [];
            foreach ($permIds as $pid) {
                $syncData[$pid] = ['scope_type' => 'global'];
            }
            $role->permissions()->sync($syncData);
        }
    }

    public function down(): void
    {
    }
};

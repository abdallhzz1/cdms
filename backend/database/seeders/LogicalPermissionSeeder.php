<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class LogicalPermissionSeeder extends Seeder
{
    public function run(): void
    {
        $roleMapping = [
            'CLINICAL_DIRECTOR' => [
                'academic_years.view', 'academic_years.manage',
                'advising.view', 'advising.export_pdf',
                'assessment.view', 'assessment.approve',
                'attendance.view', 'attendance.excuse',
                'correspondence.view', 'correspondence.create', 'correspondence.submit', 'correspondence.forward', 'correspondence.approve', 'correspondence.close',
                'course_report.manage', 'course_report.approve',
                'courses.view', 'courses.manage',
                'departments.view',
                'distribution.view', 'distribution.create', 'distribution.generate', 'distribution.update', 'distribution.validate', 'distribution.approve', 'distribution.publish', 'distribution.delete', 'distribution.override',
                'grades.view', 'grades.create', 'grades.update', 'grades.approve', 'grades.publish', 'grades.lock',
                'groups.view', 'groups.manage',
                'kpi.manage',
                'meetings.manage', 'meetings.approve_minutes',
                'partnerships.view', 'partnerships.manage',
                'people.view', 'people.manage',
                'performance.view',
                'quality.view',
                'reports.view', 'reports.export',
                'rotations.view', 'rotations.create', 'rotations.update', 'rotations.delete',
                'students.view', 'students.create', 'students.update', 'students.delete', 'students.export',
                'tasks.view', 'tasks.manage',
                'training_sites.view', 'training_sites.manage',
            ],
            'ADMIN_ASSISTANT' => [
                'academic_years.view',
                'advising.view',
                'assessment.view',
                'attendance.view', 'attendance.record',
                'correspondence.view', 'correspondence.create', 'correspondence.update', 'correspondence.submit',
                'courses.view',
                'departments.view',
                'distribution.view', 'distribution.create', 'distribution.generate', 'distribution.update', 'distribution.validate',
                'grades.view', 'grades.create', 'grades.update',
                'groups.view', 'groups.manage',
                'meetings.manage',
                'partnerships.view',
                'people.view', 'people.manage',
                'reports.view', 'reports.export',
                'rotations.view',
                'students.view', 'students.create', 'students.update', 'students.export',
                'tasks.view', 'tasks.manage',
                'training_sites.view',
            ],
            'CLINICAL_SUPERVISOR' => [
                'assessment.view', 'assessment.create', 'assessment.submit',
                'attendance.view', 'attendance.record',
                'correspondence.view', 'correspondence.create', 'correspondence.submit',
                'courses.view',
                'distribution.view',
                'grades.view',
                'people.view',
                'students.view',
                'tasks.view',
            ],
            'DEPARTMENT_HEAD' => [
                'academic_years.view',
                'assessment.view', 'assessment.approve',
                'attendance.view',
                'correspondence.view', 'correspondence.create', 'correspondence.submit', 'correspondence.approve',
                'courses.view',
                'departments.view',
                'distribution.view',
                'grades.view', 'grades.approve',
                'groups.view',
                'meetings.manage',
                'people.view',
                'performance.view',
                'reports.view', 'reports.export',
                'rotations.view',
                'students.view',
                'tasks.view', 'tasks.manage',
            ],
            'ACADEMIC_ADVISOR' => [
                'advising.view', 'advising.manage', 'advising.export_pdf',
                'assessment.view',
                'attendance.view',
                'correspondence.view', 'correspondence.create', 'correspondence.submit',
                'courses.view',
                'grades.view',
                'people.view',
                'students.view',
            ],
            'QUALITY' => [
                'courses.view',
                'kpi.manage',
                'performance.view',
                'quality.view', 'quality.manage',
                'reports.view', 'reports.export',
            ],
            'DEAN' => [
                'academic_years.view',
                'correspondence.view', 'correspondence.approve', 'correspondence.close',
                'course_report.approve',
                'courses.view',
                'distribution.view', 'distribution.publish',
                'grades.view', 'grades.publish',
                'meetings.manage', 'meetings.approve_minutes',
                'performance.view',
                'reports.view', 'reports.export',
            ],
            'VICE_DEAN' => [
                'academic_years.view',
                'correspondence.view', 'correspondence.approve', 'correspondence.close',
                'course_report.approve',
                'courses.view',
                'distribution.view', 'distribution.approve',
                'grades.view', 'grades.approve',
                'meetings.manage', 'meetings.approve_minutes',
                'performance.view',
                'reports.view', 'reports.export',
            ]
        ];

        foreach ($roleMapping as $roleCode => $permCodes) {
            $role = Role::where('code', $roleCode)->first();
            if (!$role) continue;

            $permIds = Permission::whereIn('code', $permCodes)->pluck('id')->toArray();
            
            // Sync without detaching existing ones (like sys admin's bootstrap ones)
            // But since these roles are clean, we can just sync.
            // We need to provide the pivot data ['scope_type' => 'global'] for now,
            // or rely on the backend enforcing scope natively. The backend checks RoleScope or scope_type.
            // Based on RolePermissionSeeder, they used syncWithoutDetaching with scope_type => global.
            
            $syncData = [];
            foreach ($permIds as $id) {
                $syncData[$id] = ['scope_type' => 'global'];
            }
            
            $role->permissions()->syncWithoutDetaching($syncData);
        }
    }
}

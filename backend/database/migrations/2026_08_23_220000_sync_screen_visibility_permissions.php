<?php

use Illuminate\Database\Migrations\Migration;
use App\Models\Role;
use App\Models\Permission;

return new class extends Migration
{
    public function up(): void
    {
        $keyPerms = [
            ['code' => 'people.view', 'module' => 'People', 'action' => 'view'],
            ['code' => 'people.manage', 'module' => 'People', 'action' => 'manage'],
            ['code' => 'departments.view', 'module' => 'Departments', 'action' => 'view'],
            ['code' => 'departments.manage', 'module' => 'Departments', 'action' => 'manage'],
            ['code' => 'students.view', 'module' => 'Students', 'action' => 'view'],
            ['code' => 'grades.view', 'module' => 'Grades', 'action' => 'view'],
            ['code' => 'distribution.view', 'module' => 'Distribution', 'action' => 'view'],
            ['code' => 'courses.view', 'module' => 'Courses', 'action' => 'view'],
            ['code' => 'advising.view', 'module' => 'Advising', 'action' => 'view'],
            ['code' => 'quality.view', 'module' => 'Quality', 'action' => 'view'],
            ['code' => 'reports.view', 'module' => 'Reports', 'action' => 'view'],
            ['code' => 'correspondence.view', 'module' => 'Correspondence', 'action' => 'view'],
            ['code' => 'meetings.manage', 'module' => 'Meetings', 'action' => 'manage'],
            ['code' => 'tasks.view', 'module' => 'Tasks', 'action' => 'view'],
            ['code' => 'academic_years.view', 'module' => 'AcademicYears', 'action' => 'view'],
            ['code' => 'academic_years.manage', 'module' => 'AcademicYears', 'action' => 'manage'],
            ['code' => 'users.manage', 'module' => 'Security', 'action' => 'manage'],
            ['code' => 'roles.manage', 'module' => 'Security', 'action' => 'manage'],
            ['code' => 'audit.view', 'module' => 'Security', 'action' => 'view'],
            ['code' => 'settings.manage', 'module' => 'Security', 'action' => 'manage'],
            ['code' => 'assessment.view', 'module' => 'Assessment', 'action' => 'view'],
            ['code' => 'attendance.view', 'module' => 'Attendance', 'action' => 'view'],
        ];

        foreach ($keyPerms as $kp) {
            Permission::firstOrCreate(
                ['code' => $kp['code']],
                ['module' => $kp['module'], 'action' => $kp['action']]
            );
        }

        $director = Role::where('code', 'CLINICAL_DIRECTOR')->first();
        if ($director) {
            $permIds = Permission::whereIn('code', [
                'people.view', 'people.manage', 'departments.view', 'departments.manage',
                'students.view', 'grades.view', 'distribution.view', 'courses.view',
                'advising.view', 'quality.view', 'reports.view', 'correspondence.view',
                'meetings.manage', 'tasks.view', 'academic_years.view', 'academic_years.manage',
                'assessment.view', 'attendance.view'
            ])->pluck('id')->toArray();

            foreach ($permIds as $pid) {
                if (!$director->permissions()->where('permissions.id', $pid)->exists()) {
                    $director->permissions()->attach($pid, ['scope_type' => 'global']);
                }
            }
        }

        $head = Role::where('code', 'DEPARTMENT_HEAD')->first();
        if ($head) {
            $permIds = Permission::whereIn('code', [
                'people.view', 'people.manage', 'departments.view',
                'students.view', 'grades.view', 'distribution.view', 'courses.view',
                'advising.view', 'reports.view', 'correspondence.view',
                'meetings.manage', 'tasks.view', 'assessment.view', 'attendance.view'
            ])->pluck('id')->toArray();

            foreach ($permIds as $pid) {
                if (!$head->permissions()->where('permissions.id', $pid)->exists()) {
                    $head->permissions()->attach($pid, ['scope_type' => 'department']);
                }
            }
        }
    }

    public function down(): void
    {
    }
};

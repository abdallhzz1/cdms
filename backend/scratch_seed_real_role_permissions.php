<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Role;
use App\Models\Permission;
use Illuminate\Support\Facades\DB;

// Clear existing role_permissions pivot table
DB::table('role_permissions')->truncate();

// Define authentic permissions for each role according to the Clinical Department Matrix
$matrixConfig = [
    'SYS_ADMIN' => Permission::pluck('code')->toArray(), // System Admin has all permissions
    
    'DEAN' => [
        'students.view', 'grades.view', 'grades.approve', 'distribution.view',
        'courses.view', 'reports.view', 'reports.export', 'quality.view',
        'correspondence.view', 'correspondence.approve', 'meetings.manage', 'tasks.view'
    ],
    
    'VICE_DEAN' => [
        'students.view', 'grades.view', 'grades.approve', 'distribution.view',
        'courses.view', 'reports.view', 'reports.export', 'quality.view',
        'correspondence.view', 'meetings.manage', 'tasks.view'
    ],
    
    'CLINICAL_DIRECTOR' => [
        'students.view', 'students.update', 'students.export', 'distribution.view',
        'distribution.create', 'distribution.update', 'distribution.publish',
        'rotations.view', 'rotations.create', 'rotations.update', 'rotations.delete',
        'courses.view', 'courses.manage', 'grades.view', 'grades.approve',
        'reports.view', 'reports.export', 'attendance.view', 'assessment.view',
        'assessment.approve', 'meetings.manage', 'tasks.view', 'tasks.manage'
    ],
    
    'DEPARTMENT_HEAD' => [
        'students.view', 'students.update', 'courses.view', 'grades.view',
        'grades.create', 'grades.update', 'grades.approve', 'distribution.view',
        'attendance.view', 'assessment.view', 'assessment.approve', 'quality.view',
        'reports.view', 'meetings.manage', 'tasks.view'
    ],
    
    'ADMIN_ASSISTANT' => [
        'students.view', 'students.create', 'students.update', 'distribution.view',
        'courses.view', 'correspondence.view', 'correspondence.create',
        'correspondence.update', 'correspondence.submit', 'tasks.view'
    ],
    
    'CLINICAL_SUPERVISOR' => [
        'distribution.view', 'attendance.view', 'attendance.record', 'attendance.excuse',
        'assessment.view', 'assessment.create', 'assessment.submit', 'tasks.view'
    ],
    
    'RTA' => [
        'students.view', 'distribution.view', 'attendance.view', 'attendance.record',
        'assessment.view', 'tasks.view'
    ],
    
    'ACADEMIC_ADVISOR' => [
        'students.view', 'advising.view', 'advising.manage', 'tasks.view'
    ],
    
    'QUALITY' => [
        'students.view', 'courses.view', 'quality.view', 'quality.manage',
        'kpi.manage', 'performance.view', 'reports.view'
    ],
];

foreach ($matrixConfig as $roleCode => $permCodes) {
    $role = Role::where('code', $roleCode)->first();
    if (!$role) continue;

    $perms = Permission::whereIn('code', $permCodes)->pluck('id');
    foreach ($perms as $permId) {
        DB::table('role_permissions')->insert([
            'role_id' => $role->id,
            'permission_id' => $permId,
            'scope_type' => 'global',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
    echo "SET " . count($perms) . " PERMISSIONS FOR ROLE: {$roleCode}\n";
}

echo "REAL AUTHENTIC ROLE-PERMISSION MATRIX RESTORED SUCCESSFULLY.\n";

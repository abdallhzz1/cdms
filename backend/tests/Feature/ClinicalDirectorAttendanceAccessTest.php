<?php

namespace Tests\Feature;

use App\Models\Role;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ClinicalDirectorAttendanceAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_fresh_clinical_director_role_can_open_attendance_review_screen(): void
    {
        $this->seed([RoleSeeder::class, PermissionSeeder::class, RolePermissionSeeder::class]);

        $role = Role::where('code', 'CLINICAL_DIRECTOR')->firstOrFail();

        $this->assertTrue($role->permissions()->where('code', 'attendance.review')->exists());
    }
}

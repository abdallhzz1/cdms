<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\DepartmentHeadProfile;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PerformanceSafetyTest extends TestCase
{
    use RefreshDatabase;

    private User $viewer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([
            \Database\Seeders\PermissionSeeder::class,
            \Database\Seeders\RoleSeeder::class,
        ]);

        $role = Role::create([
            'code' => 'PERFORMANCE_TEST',
            'name_key' => 'performance_test',
            'name_ar' => 'اختبار الأداء',
            'name_en' => 'Performance test',
        ]);
        $permissions = Permission::whereIn('code', ['courses.view', 'people.view'])->get();
        $role->permissions()->attach($permissions->pluck('id')->all(), ['scope_type' => 'global']);

        $this->viewer = User::factory()->create();
        $this->viewer->roles()->attach($role->id);
    }

    public function test_large_per_page_value_is_capped(): void
    {
        Course::factory()->count(205)->create();

        $this->actingAs($this->viewer)
            ->getJson('/api/v1/courses?per_page=10000')
            ->assertOk()
            ->assertJsonCount(200, 'data')
            ->assertJsonPath('meta.total', 205)
            ->assertJsonPath('meta.last_page', 2);
    }

    public function test_profile_directory_get_does_not_create_missing_profiles(): void
    {
        $supervisorRole = Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail();
        $supervisor = User::factory()->create(['is_active' => true]);
        $supervisor->roles()->attach($supervisorRole->id);

        $this->assertDatabaseCount('department_head_profiles', 0);

        $this->actingAs($this->viewer)
            ->getJson('/api/v1/clinical-supervisors')
            ->assertOk();
        $this->actingAs($this->viewer)
            ->getJson("/api/v1/clinical-supervisors/{$supervisor->id}")
            ->assertOk();

        $this->assertDatabaseCount('department_head_profiles', 0);
        $this->assertFalse(DepartmentHeadProfile::where('user_id', $supervisor->id)->exists());
    }
}

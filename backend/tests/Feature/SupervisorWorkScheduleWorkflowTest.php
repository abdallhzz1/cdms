<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\TrainingSite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SupervisorWorkScheduleWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private User $supervisor;
    private Person $person;
    private TrainingSite $site;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([
            \Database\Seeders\PermissionSeeder::class,
            \Database\Seeders\Phase3PermissionSeeder::class,
            \Database\Seeders\RoleSeeder::class,
        ]);

        $managerRole = Role::create([
            'code' => 'WORK_SCHEDULE_MANAGER_TEST',
            'name_key' => 'work_schedule_manager_test',
            'name_ar' => 'مدير اختبار',
            'name_en' => 'Test manager',
        ]);
        $permissions = Permission::whereIn('code', ['people.manage', 'distribution.view'])->pluck('id');
        $managerRole->permissions()->sync($permissions->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all());
        $this->manager = User::factory()->create();
        $this->manager->roles()->attach($managerRole);

        $this->supervisor = User::factory()->create(['is_active' => true]);
        $this->supervisor->roles()->attach(Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail());
        $this->person = Person::factory()->create([
            'user_id' => $this->supervisor->id,
            'email' => $this->supervisor->email,
            'is_active' => true,
        ]);
        $this->site = TrainingSite::factory()->create(['is_active' => true]);
    }

    public function test_workplace_without_any_working_day_is_rejected(): void
    {
        $this->actingAs($this->manager)->putJson("/api/v1/clinical-workforce/doctors/{$this->supervisor->id}/work-schedules", [
            'schedules' => [[
                'training_site_id' => $this->site->id,
                'is_primary' => true,
                'valid_from' => '2026-08-29',
                'valid_until' => '2026-11-14',
                'days' => [['day' => 'saturday', 'status' => 'unavailable']],
            ]],
        ])->assertUnprocessable()->assertJsonValidationErrors(['schedules.0.days']);

        $this->assertDatabaseMissing('person_training_site', [
            'person_id' => $this->person->id,
            'training_site_id' => $this->site->id,
        ]);
    }

    public function test_supervisor_returns_to_distribution_after_unlinking_and_saving_a_valid_schedule(): void
    {
        $this->actingAs($this->manager)->putJson("/api/v1/clinical-workforce/doctors/{$this->supervisor->id}/hospital", [
            'primary_site_id' => null,
        ])->assertOk();

        $this->actingAs($this->manager)->putJson("/api/v1/clinical-workforce/doctors/{$this->supervisor->id}/work-schedules", [
            'schedules' => [[
                'training_site_id' => $this->site->id,
                'is_primary' => true,
                'valid_from' => '2026-08-29',
                'valid_until' => '2026-11-14',
                'days' => [['day' => 'saturday', 'status' => 'work']],
            ]],
        ])->assertOk();

        $this->actingAs($this->manager)->getJson('/api/v1/course-distribution/options')
            ->assertOk()
            ->assertJsonFragment([
                'id' => $this->person->id,
                'user_id' => $this->supervisor->id,
            ]);

        $this->assertDatabaseHas('person_training_site', [
            'person_id' => $this->person->id,
            'training_site_id' => $this->site->id,
            'is_primary' => true,
        ]);
    }
}

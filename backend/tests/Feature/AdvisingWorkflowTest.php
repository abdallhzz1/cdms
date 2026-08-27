<?php

namespace Tests\Feature;

use App\Models\AdvisingRecord;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\Student;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdvisingWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([PermissionSeeder::class, RoleSeeder::class]);
    }

    public function test_advisor_overview_only_contains_assigned_students_and_accurate_metrics(): void
    {
        $role = Role::where('code', 'ACADEMIC_ADVISOR')->firstOrFail();
        $this->grant($role, ['advising.view', 'advising.manage']);
        $user = User::factory()->create();
        $person = Person::factory()->create(['user_id' => $user->id]);
        $user->roles()->attach($role, ['scope_type' => 'global']);

        $assigned = Student::factory()->create([
            'academic_advisor_id' => $person->id,
            'academic_level' => 'fourth',
            'warning_count' => 1,
            'registration_status' => 'active',
        ]);
        Student::factory()->create(['academic_level' => 'fifth', 'registration_status' => 'active']);
        AdvisingRecord::create([
            'student_id' => $assigned->id,
            'advisor_person_id' => $person->id,
            'meeting_date' => now()->toDateString(),
            'category' => 'risk',
            'notes' => 'Follow-up required',
            'status' => 'open',
        ]);

        $this->actingAs($user)->getJson('/api/v1/advising-overview')
            ->assertOk()
            ->assertJsonPath('data.metrics.students', 1)
            ->assertJsonPath('data.metrics.at_risk', 1)
            ->assertJsonPath('data.metrics.open_cases', 1)
            ->assertJsonCount(1, 'data.students')
            ->assertJsonPath('data.students.0.id', $assigned->id)
            ->assertJsonPath('data.level_counts.fifth', 0);
    }

    public function test_new_session_uses_the_logged_in_advisor_identity_and_receives_a_reference(): void
    {
        $role = Role::where('code', 'ACADEMIC_ADVISOR')->firstOrFail();
        $this->grant($role, ['advising.manage']);
        $user = User::factory()->create();
        $person = Person::factory()->create(['user_id' => $user->id]);
        $user->roles()->attach($role, ['scope_type' => 'global']);
        $student = Student::factory()->create(['academic_advisor_id' => $person->id]);
        $otherAdvisor = Person::factory()->create();

        $this->actingAs($user)->postJson('/api/v1/advising-records', [
            'student_id' => $student->id,
            'advisor_person_id' => $otherAdvisor->id,
            'meeting_date' => '2026-08-28',
            'category' => 'academic',
            'notes' => 'Academic follow-up session',
            'action_plan' => 'Review progress next month',
        ])->assertCreated()
            ->assertJsonPath('data.advisor_person_id', $person->id)
            ->assertJsonPath('data.meeting_number', 'ADV-2026-00001');
    }

    public function test_assignment_permission_is_separate_and_only_academic_advisors_are_listed(): void
    {
        $managerRole = Role::create(['code' => 'ADVISING_ASSIGNMENT_MANAGER', 'name_key' => 'roles.advising_assignment_manager']);
        $this->grant($managerRole, ['advising.assign']);
        $manager = User::factory()->create();
        $manager->roles()->attach($managerRole, ['scope_type' => 'global']);

        $advisor = User::factory()->create(['name' => 'Academic Advisor']);
        $advisor->roles()->attach(Role::where('code', 'ACADEMIC_ADVISOR')->firstOrFail(), ['scope_type' => 'global']);
        $unrelated = User::factory()->create(['name' => 'Administrative Assistant']);
        $unrelated->roles()->attach(Role::where('code', 'ADMIN_ASSISTANT')->firstOrFail(), ['scope_type' => 'global']);
        $student = Student::factory()->create();

        $this->actingAs($manager)->getJson('/api/v1/users/lookup?purpose=advising')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $advisor->id);

        $this->actingAs($manager)->postJson('/api/v1/students/bulk-assign-advisor', [
            'assignments' => [[
                'student_id' => $student->id,
                'academic_advisor_id' => $advisor->id,
            ]],
        ])->assertOk();

        $advisorPerson = Person::where('user_id', $advisor->id)->firstOrFail();
        $this->assertSame($advisorPerson->id, $student->fresh()->academic_advisor_id);

        $viewerRole = Role::create(['code' => 'ADVISING_VIEWER', 'name_key' => 'roles.advising_viewer']);
        $this->grant($viewerRole, ['advising.view']);
        $viewer = User::factory()->create();
        $viewer->roles()->attach($viewerRole, ['scope_type' => 'global']);
        $this->actingAs($viewer)->postJson('/api/v1/students/bulk-assign-advisor', [
            'assignments' => [['student_id' => $student->id, 'academic_advisor_id' => null]],
        ])->assertForbidden();
    }

    private function grant(Role $role, array $codes): void
    {
        foreach (Permission::whereIn('code', $codes)->get() as $permission) {
            $role->permissions()->syncWithoutDetaching([
                $permission->id => ['scope_type' => 'global'],
            ]);
        }
    }
}

<?php

namespace Tests\Feature\Phase3A;

use App\Models\AcademicYear;
use App\Models\AdvisingRecord;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\Student;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\Phase3PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StudentTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RoleSeeder::class, PermissionSeeder::class, Phase3PermissionSeeder::class, RolePermissionSeeder::class]);
        
        $sysAdminRole = \App\Models\Role::where('code', 'SYS_ADMIN')->first();
        $sysAdminRole->permissions()->sync(\App\Models\Permission::pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($sysAdminRole);
    }

    public function test_can_list_students_with_filters()
    {
        Student::factory()->count(3)->forLevel('fourth')->active()->create();
        Student::factory()->count(2)->forLevel('fifth')->atRisk()->create();

        // No filter
        $this->actingAs($this->admin)->getJson('/api/v1/students')
            ->assertStatus(200)
            ->assertJsonCount(5, 'data');

        // Filter by level
        $this->actingAs($this->admin)->getJson('/api/v1/students?academic_level=fifth')
            ->assertStatus(200)
            ->assertJsonCount(2, 'data');

        // Filter by risk (warning_count >= 1)
        $this->actingAs($this->admin)->getJson('/api/v1/students?warning_count_min=1')
            ->assertStatus(200)
            ->assertJsonCount(2, 'data');
    }

    public function test_can_create_student()
    {
        $year = AcademicYear::factory()->create();
        $advisor = Person::factory()->create();

        $payload = [
            'university_number' => '22310001',
            'full_name_ar' => 'طالب تجريبي',
            'academic_level' => 'fourth',
            'registration_status' => 'active',
            'academic_year_id' => $year->id,
            'academic_advisor_id' => $advisor->id,
            'clinical_fees_status' => 'paid',
            'has_amboss_subscription' => true,
        ];

        $response = $this->actingAs($this->admin)->postJson('/api/v1/students', $payload);

        $response->assertStatus(201)
            ->assertJsonPath('data.university_number', '22310001');

        $this->assertDatabaseHas('students', [
            'university_number' => '22310001',
            'academic_advisor_id' => $advisor->id,
        ]);
    }

    public function test_academic_advisor_can_only_access_assigned_students(): void
    {
        $advisorUser = User::factory()->create();
        $advisorPerson = Person::factory()->create(['user_id' => $advisorUser->id]);
        $advisorRole = Role::where('code', 'ACADEMIC_ADVISOR')->firstOrFail();
        $studentView = Permission::where('code', 'students.view')->firstOrFail();
        $advisorRole->permissions()->syncWithoutDetaching([
            $studentView->id => ['scope_type' => 'global'],
        ]);
        $advisorUser->roles()->attach($advisorRole->id);

        $assigned = Student::factory()->create(['academic_advisor_id' => $advisorPerson->id]);
        $outsideScope = Student::factory()->create();

        $this->actingAs($advisorUser)->getJson('/api/v1/students')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $assigned->id);

        $this->actingAs($advisorUser)->getJson("/api/v1/students/{$assigned->id}")
            ->assertOk();

        $this->actingAs($advisorUser)->getJson("/api/v1/students/{$outsideScope->id}")
            ->assertStatus(403);
    }

    public function test_academic_advisor_cannot_read_or_update_an_out_of_scope_advising_record(): void
    {
        $advisorUser = User::factory()->create();
        $advisorPerson = Person::factory()->create(['user_id' => $advisorUser->id]);
        $advisorRole = Role::where('code', 'ACADEMIC_ADVISOR')->firstOrFail();
        $permissions = Permission::whereIn('code', ['advising.view', 'advising.manage'])->get();
        $advisorRole->permissions()->syncWithoutDetaching(
            $permissions->mapWithKeys(fn ($permission) => [
                $permission->id => ['scope_type' => 'global'],
            ])->all()
        );
        $advisorUser->roles()->attach($advisorRole->id);

        $assigned = Student::factory()->create(['academic_advisor_id' => $advisorPerson->id]);
        $outsideScope = Student::factory()->create();
        $ownRecord = AdvisingRecord::create([
            'student_id' => $assigned->id,
            'advisor_person_id' => $advisorPerson->id,
            'meeting_date' => now()->toDateString(),
            'category' => 'academic',
            'notes' => 'Assigned student record',
        ]);
        $outsideRecord = AdvisingRecord::create([
            'student_id' => $outsideScope->id,
            'meeting_date' => now()->toDateString(),
            'category' => 'academic',
            'notes' => 'Outside scope record',
        ]);

        $this->actingAs($advisorUser)->getJson('/api/v1/advising-records')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $ownRecord->id);

        $this->actingAs($advisorUser)->getJson("/api/v1/advising-records/{$outsideRecord->id}")
            ->assertStatus(403);

        $this->actingAs($advisorUser)->putJson("/api/v1/advising-records/{$outsideRecord->id}", [
            'notes' => 'Unauthorized change',
        ])->assertStatus(403);

        $this->assertDatabaseHas('advising_records', [
            'id' => $outsideRecord->id,
            'notes' => 'Outside scope record',
        ]);
    }
}

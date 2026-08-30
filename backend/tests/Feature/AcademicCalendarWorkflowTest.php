<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Rotation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AcademicCalendarWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private AcademicYear $year;

    protected function setUp(): void
    {
        parent::setUp();
        $permissions = collect(['academic_years.view', 'academic_years.manage'])->map(fn (string $code) =>
            Permission::firstOrCreate(['code' => $code], ['module' => 'Academic Years', 'action' => 'MANAGE', 'description_key' => $code])
        );
        $role = Role::create(['code' => 'CALENDAR_MANAGER', 'name_key' => 'calendar.manager']);
        foreach ($permissions as $permission) {
            $role->permissions()->attach($permission->id, ['scope_type' => 'global']);
        }
        $this->user = User::factory()->create();
        $this->user->roles()->attach($role);
        $this->year = AcademicYear::factory()->create([
            'code' => '2026/2027',
            'start_date' => '2026-08-01',
            'end_date' => '2027-07-31',
        ]);
    }

    public function test_manager_can_create_update_and_delete_a_calendar_event(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/v1/academic-calendar-events', [
            'academic_year_id' => $this->year->id,
            'name' => 'امتحان الجراحة',
            'event_type' => 'exam',
            'start_date' => '2027-05-01',
            'end_date' => '2027-05-01',
            'affected_levels' => ['sixth'],
            'suspends_clinical_training' => true,
        ])->assertCreated()->assertJsonPath('data.affected_levels.0', 'sixth');

        $eventId = $response->json('data.id');
        $this->actingAs($this->user)->putJson("/api/v1/academic-calendar-events/{$eventId}", [
            'academic_year_id' => $this->year->id,
            'name' => 'امتحان الجراحة النهائي',
            'event_type' => 'exam',
            'start_date' => '2027-05-02',
            'end_date' => '2027-05-02',
            'affected_levels' => ['sixth'],
            'suspends_clinical_training' => true,
        ])->assertOk()->assertJsonPath('data.name', 'امتحان الجراحة النهائي');

        $this->actingAs($this->user)->deleteJson("/api/v1/academic-calendar-events/{$eventId}")->assertOk();
        $this->assertDatabaseMissing('academic_calendar_events', ['id' => $eventId]);
    }

    public function test_overview_combines_calendar_events_with_distribution_rotations(): void
    {
        Rotation::create([
            'academic_year_id' => $this->year->id,
            'code' => 'Y6-R1',
            'name' => 'الدورة الأولى',
            'academic_level' => 'sixth',
            'duration_weeks' => 12,
            'start_date' => '2026-08-02',
            'end_date' => '2026-10-24',
            'status' => 'active',
        ]);

        $this->actingAs($this->user)->getJson("/api/v1/academic-calendar-overview/{$this->year->id}")
            ->assertOk()
            ->assertJsonPath('data.academic_year.code', '2026/2027')
            ->assertJsonPath('data.rotations.0.code', 'Y6-R1');
    }

    public function test_event_dates_must_stay_inside_the_selected_academic_year(): void
    {
        $this->actingAs($this->user)->postJson('/api/v1/academic-calendar-events', [
            'academic_year_id' => $this->year->id,
            'name' => 'حدث خارج العام',
            'event_type' => 'other',
            'start_date' => '2027-08-01',
            'end_date' => '2027-08-01',
        ])->assertStatus(422);
    }
}

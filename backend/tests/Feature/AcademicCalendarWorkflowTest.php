<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\ClinicalPeriod;
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

    public function test_period_dates_are_independent_per_clinical_year_without_rewriting_existing_rotations(): void
    {
        $created = $this->actingAs($this->user)->postJson('/api/v1/clinical-periods', [
            'academic_year_id' => $this->year->id,
            'code' => 'P1',
            'name_ar' => 'الفترة السريرية الأولى',
            'name_en' => 'Clinical Period 1',
            'sequence' => 1,
            'status' => 'active',
            'level_dates' => [
                ['academic_level' => 'fourth', 'start_date' => '2026-09-01', 'end_date' => '2026-11-23', 'weeks_count' => 12],
                ['academic_level' => 'fifth', 'start_date' => '2026-09-01', 'end_date' => '2026-11-23', 'weeks_count' => 12],
                ['academic_level' => 'sixth', 'start_date' => '2026-08-01', 'end_date' => '2026-10-23', 'weeks_count' => 12],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.level_dates.0.academic_level', 'fourth')
            ->assertJsonPath('data.level_dates.2.start_date', '2026-08-01');

        $period = ClinicalPeriod::findOrFail($created->json('data.id'));
        $rotation = Rotation::create([
            'academic_year_id' => $this->year->id,
            'course_id' => null,
            'clinical_period_id' => $period->id,
            'schedule_scope' => 'period',
            'code' => 'Y6-P1',
            'name' => 'سادسة - الفترة الأولى',
            'academic_level' => 'sixth',
            'duration_weeks' => 12,
            'start_date' => '2026-08-01',
            'end_date' => '2026-10-23',
            'status' => 'active',
        ]);

        $this->actingAs($this->user)->putJson("/api/v1/clinical-periods/{$period->id}", [
            'academic_year_id' => $this->year->id,
            'code' => 'P1',
            'name_ar' => 'الفترة السريرية الأولى',
            'name_en' => 'Clinical Period 1',
            'sequence' => 1,
            'status' => 'active',
            'level_dates' => [
                ['academic_level' => 'fourth', 'start_date' => '2026-09-01', 'end_date' => '2026-11-23', 'weeks_count' => 12],
                ['academic_level' => 'fifth', 'start_date' => '2026-09-01', 'end_date' => '2026-11-23', 'weeks_count' => 12],
                ['academic_level' => 'sixth', 'start_date' => '2026-08-08', 'end_date' => '2026-10-30', 'weeks_count' => 12],
            ],
        ])->assertOk()->assertJsonPath('data.level_dates.2.start_date', '2026-08-08');

        $rotation->refresh();
        $this->assertSame('2026-08-01', $rotation->start_date->toDateString());
        $this->assertSame('2026-10-23', $rotation->end_date->toDateString());
        $period->refresh()->load('levelDates');
        $this->assertSame('2026-08-08', $period->datesForLevel('sixth')?->start_date->toDateString());
    }

    public function test_period_envelopes_may_overlap_when_each_academic_level_remains_sequential(): void
    {
        $base = [
            'academic_year_id' => $this->year->id,
            'name_en' => null,
            'status' => 'active',
        ];
        $this->actingAs($this->user)->postJson('/api/v1/clinical-periods', $base + [
            'code' => 'P1',
            'name_ar' => 'الفترة الأولى',
            'sequence' => 1,
            'level_dates' => [
                ['academic_level' => 'fourth', 'start_date' => '2026-09-01', 'end_date' => '2026-11-23', 'weeks_count' => 12],
                ['academic_level' => 'fifth', 'start_date' => '2026-09-01', 'end_date' => '2026-11-23', 'weeks_count' => 12],
                ['academic_level' => 'sixth', 'start_date' => '2026-08-01', 'end_date' => '2026-10-23', 'weeks_count' => 12],
            ],
        ])->assertCreated();

        $this->actingAs($this->user)->postJson('/api/v1/clinical-periods', $base + [
            'code' => 'P2',
            'name_ar' => 'الفترة الثانية',
            'sequence' => 2,
            'level_dates' => [
                ['academic_level' => 'fourth', 'start_date' => '2026-11-24', 'end_date' => '2027-02-15', 'weeks_count' => 12],
                ['academic_level' => 'fifth', 'start_date' => '2026-11-24', 'end_date' => '2027-02-15', 'weeks_count' => 12],
                ['academic_level' => 'sixth', 'start_date' => '2026-10-24', 'end_date' => '2027-01-15', 'weeks_count' => 12],
            ],
        ])->assertCreated();

        $this->assertDatabaseCount('clinical_periods', 2);
        $this->assertDatabaseCount('clinical_period_level_dates', 6);
    }
}

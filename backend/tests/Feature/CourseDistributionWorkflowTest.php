<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\ClinicalPeriod;
use App\Models\CourseScheduleCell;
use App\Models\CourseScheduleRow;
use App\Models\DistributionVersion;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use App\Models\TrainingSite;
use App\Models\User;
use App\Services\Distribution\CourseScheduleMembershipSyncService;
use App\Services\Distribution\DistributionApprovalService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CourseDistributionWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private AcademicYear $year;
    private Course $course;
    private StudentSubgroup $subgroup;
    private Person $doctor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\Phase3PermissionSeeder::class, \Database\Seeders\RoleSeeder::class]);
        $role = Role::create(['code' => 'COURSE_DISTRIBUTOR_TEST', 'name_key' => 'test', 'name_ar' => 'Test', 'name_en' => 'Test']);
        $ids = Permission::whereIn('code', ['distribution.view', 'distribution.update', 'distribution.schedule_rows.manage', 'distribution.approve', 'distribution.publish', 'distribution.override', 'distribution.revise', 'distribution.unpublish', 'distribution.delete', 'rotations.create', 'people.manage'])->pluck('id');
        $role->permissions()->sync($ids->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all());
        $this->user = User::factory()->create();
        $this->user->roles()->attach($role);
        $directorRole = Role::where('code', 'CLINICAL_DIRECTOR')->firstOrFail();
        $directorRole->permissions()->syncWithoutDetaching(
            Permission::where('code', 'approvals.decide')->pluck('id')->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all()
        );
        $this->user->roles()->attach($directorRole);

        $this->year = AcademicYear::factory()->create([
            'is_current' => true,
            'status' => 'active',
            'start_date' => '2026-08-01',
            'end_date' => '2027-07-31',
        ]);
        $this->course = Course::create(['code' => 'MED401', 'name_ar' => 'باطني', 'credit_hours' => 4, 'academic_level' => 'fourth', 'semester' => 1, 'is_active' => true]);
        Course::create(['code' => 'MED501', 'name_ar' => 'جراحة', 'credit_hours' => 4, 'academic_level' => 'fifth', 'semester' => 1, 'is_active' => true]);
        $group = StudentGroup::factory()->create(['academic_year_id' => $this->year->id, 'academic_level' => 'fourth', 'name' => 'L']);
        $this->subgroup = StudentSubgroup::factory()->create(['student_group_id' => $group->id, 'name' => 'L1', 'is_active' => true]);
        foreach (Student::factory()->count(2)->create(['academic_year_id' => $this->year->id, 'academic_level' => 'fourth', 'registration_status' => 'active']) as $student) {
            StudentGroupAssignment::factory()->create(['student_id' => $student->id, 'academic_year_id' => $this->year->id, 'student_group_id' => $group->id, 'student_subgroup_id' => $this->subgroup->id, 'valid_until' => null]);
        }
        $site = TrainingSite::factory()->create(['is_active' => true]);
        $doctorUser = User::factory()->create();
        $doctorUser->roles()->attach(Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail());
        $this->doctor = Person::factory()->create([
            'user_id' => $doctorUser->id,
            'email' => $doctorUser->email,
            'primary_site_id' => $site->id,
            'is_active' => true,
        ]);
        $this->doctor->trainingSites()->attach($site->id, ['is_primary' => true]);
    }

    public function test_options_expose_courses_by_their_academic_level_and_hospital_doctors(): void
    {
        $this->actingAs($this->user)->getJson('/api/v1/course-distribution/options')
            ->assertOk()
            ->assertJsonFragment(['id' => $this->course->id, 'academic_level' => 'fourth'])
            ->assertJsonPath('data.hospitals.0.supervisors.0.id', $this->doctor->id);
    }

    public function test_supervisor_can_be_scheduled_at_either_linked_hospital_and_published_sites_are_preserved(): void
    {
        $secondSite = TrainingSite::factory()->create(['is_active' => true]);
        $schedules = collect([
            [$this->doctor->primary_site_id, 'tuesday'], [$secondSite->id, 'wednesday'],
        ])->map(fn ($item, $index) => [
            'training_site_id' => $item[0], 'is_primary' => $index === 0,
            'valid_from' => '2026-09-01', 'valid_until' => '2026-09-30',
            'days' => [['day' => $item[1], 'status' => 'work']],
        ])->all();
        $this->actingAs($this->user)->putJson("/api/v1/clinical-workforce/doctors/{$this->doctor->user_id}/work-schedules", ['schedules' => $schedules])->assertOk();
        $options = $this->getJson('/api/v1/course-distribution/options')->assertOk();
        foreach ([$this->doctor->primary_site_id, $secondSite->id] as $siteId) {
            $hospital = collect($options->json('data.hospitals'))->firstWhere('id', $siteId);
            $this->assertContains($this->doctor->id, array_column($hospital['supervisors'], 'id'));
        }

        $created = $this->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id, 'academic_level' => 'fourth', 'course_id' => $this->course->id,
            'start_date' => '2026-09-01', 'weeks_count' => 2,
        ])->assertCreated();
        $versionId = $created->json('data.version.id');
        $blocks = RotationBlock::where('rotation_id', $created->json('data.rotation.id'))->orderBy('from_week')->get();
        // The same supervisor appears in two rows, each bound to its selected workplace.
        foreach ([$secondSite->id, $this->doctor->primary_site_id] as $index => $siteId) {
            $rowId = $this->postJson("/api/v1/course-distribution/versions/{$versionId}/rows", [
                'row_type' => 'doctor', 'person_id' => $this->doctor->id, 'training_site_id' => $siteId,
            ])->assertCreated()->json('data.id');
            $this->putJson("/api/v1/course-distribution/versions/{$versionId}/cell", [
                'rotation_block_id' => $blocks[$index]->id, 'course_schedule_row_id' => $rowId,
                'subgroup_id' => $this->subgroup->id,
            ])->assertOk();
        }
        $this->getJson('/api/v1/course-distribution/schedule?academic_year_id='.$this->year->id.'&academic_level=fourth&course_id='.$this->course->id)
            ->assertOk()->assertJsonPath('data.rows.0.training_site_id', $secondSite->id)
            ->assertJsonPath('data.rows.0.supervisors.0.weekdays', ['wednesday'])
            ->assertJsonPath('data.rows.1.supervisors.0.weekdays', ['tuesday']);
        $this->completeApproval($versionId);
        $version = DistributionVersion::findOrFail($versionId);
        $this->actingAs($this->user)->postJson("/api/v1/distribution-versions/{$versionId}/publish", [
            'last_updated_at' => $version->updated_at->toIso8601String(),
        ])->assertOk();
        $student = Student::where('academic_year_id', $this->year->id)->firstOrFail();
        $published = app(\App\Services\Distribution\ClinicalScheduleQueryService::class)->getStudentSchedule($student);
        $this->assertSame([$secondSite->id, (int) $this->doctor->primary_site_id], $published->pluck('training_site.id')->all());
        $this->assertSame(['wednesday'], array_column($published[0]['supervisor']['work_schedule'], 'day'));
        $this->assertSame(['tuesday'], array_column($published[1]['supervisor']['work_schedule'], 'day'));
        $this->assertSame(2, $this->doctor->fresh()->trainingSites()->count());
    }

    public function test_existing_dated_workplace_is_available_even_if_legacy_site_pivot_is_missing(): void
    {
        $site = TrainingSite::factory()->create(['is_active' => true]);
        $unrelated = TrainingSite::factory()->create(['is_active' => true]);
        $this->doctor->availabilities()->create([
            'training_site_id' => $site->id, 'day' => 'tuesday', 'status' => null,
            'available_from' => '2026-09-01', 'available_until' => '2026-09-30',
        ]);
        $options = $this->actingAs($this->user)->getJson('/api/v1/course-distribution/options')->assertOk();
        $hospital = collect($options->json('data.hospitals'))->firstWhere('id', $site->id);
        $this->assertSame([$this->doctor->id], array_column($hospital['supervisors'], 'id'));
        $created = $this->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id, 'academic_level' => 'fourth', 'course_id' => $this->course->id,
            'start_date' => '2026-09-01', 'weeks_count' => 1,
        ])->assertCreated();
        $versionId = $created->json('data.version.id');
        $rotation = Rotation::findOrFail($created->json('data.rotation.id'));
        $rotation->siteCapacityRules()->create(['site_id' => $site->id, 'max_students' => 20]);
        $this->getJson("/api/v1/distribution-versions/{$versionId}/options")->assertOk()
            ->assertJsonPath('data.supervisors.0.id', $this->doctor->id)
            ->assertJsonPath('data.supervisors.0.training_site_ids.1', $site->id);
        $rowId = $this->postJson("/api/v1/course-distribution/versions/{$versionId}/rows", [
            'row_type' => 'doctor', 'person_id' => $this->doctor->id, 'training_site_id' => $site->id,
        ])->assertCreated()->json('data.id');
        $this->putJson("/api/v1/course-distribution/versions/{$versionId}/cell", [
            'rotation_block_id' => $rotation->blocks()->first()->id, 'course_schedule_row_id' => $rowId,
            'subgroup_id' => $this->subgroup->id,
        ])->assertOk();
        $this->postJson("/api/v1/course-distribution/versions/{$versionId}/rows", [
            'row_type' => 'doctor', 'person_id' => $this->doctor->id, 'training_site_id' => $unrelated->id,
        ])->assertUnprocessable();
        $this->completeApproval($versionId);
        $version = DistributionVersion::findOrFail($versionId);
        $this->actingAs($this->user)->postJson("/api/v1/distribution-versions/{$versionId}/publish", [
            'last_updated_at' => $version->updated_at->toIso8601String(),
        ])->assertOk();
    }

    public function test_changing_a_row_hospital_updates_default_cells_but_preserves_explicit_week_overrides(): void
    {
        $secondSite = TrainingSite::factory()->create(['is_active' => true]);
        $overrideSite = TrainingSite::factory()->create(['is_active' => true]);
        $this->doctor->trainingSites()->attach([$secondSite->id, $overrideSite->id]);
        $created = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id, 'academic_level' => 'fourth', 'course_id' => $this->course->id,
            'start_date' => '2026-09-01', 'weeks_count' => 2,
        ])->assertCreated();
        $versionId = $created->json('data.version.id');
        $blocks = RotationBlock::where('rotation_id', $created->json('data.rotation.id'))->orderBy('from_week')->get();
        $rowId = $this->postJson("/api/v1/course-distribution/versions/{$versionId}/rows", [
            'row_type' => 'doctor', 'person_id' => $this->doctor->id, 'training_site_id' => $this->doctor->primary_site_id,
        ])->assertCreated()->json('data.id');
        foreach ($blocks as $index => $block) {
            $this->putJson("/api/v1/course-distribution/versions/{$versionId}/cell", [
                'rotation_block_id' => $block->id, 'course_schedule_row_id' => $rowId, 'subgroup_id' => $this->subgroup->id,
                ...($index === 1 ? ['training_site_id' => $overrideSite->id] : []),
            ])->assertOk();
        }
        $assignmentIds = StudentClinicalAssignment::where('distribution_version_id', $versionId)->orderBy('id')->pluck('id')->all();
        $this->putJson("/api/v1/course-distribution/versions/{$versionId}/rows/{$rowId}", [
            'row_type' => 'doctor', 'person_id' => $this->doctor->id, 'training_site_id' => $secondSite->id,
        ])->assertOk();
        $this->assertSame([$secondSite->id, $overrideSite->id], CourseScheduleCell::where('course_schedule_row_id', $rowId)->orderBy('rotation_block_id')->pluck('training_site_id')->all());
        $this->assertSame($assignmentIds, StudentClinicalAssignment::where('distribution_version_id', $versionId)->orderBy('id')->pluck('id')->all());
        $this->completeApproval($versionId);
        $version = DistributionVersion::findOrFail($versionId);
        $this->actingAs($this->user)->postJson("/api/v1/distribution-versions/{$versionId}/publish", ['last_updated_at' => $version->updated_at->toIso8601String()])->assertOk();
        $student = Student::where('academic_year_id', $this->year->id)->firstOrFail();
        $schedule = app(\App\Services\Distribution\ClinicalScheduleQueryService::class)->getStudentSchedule($student);
        $this->assertSame([$secondSite->id, $overrideSite->id], $schedule->pluck('training_site.id')->all());
        $this->assertSame($this->doctor->primary_site_id, $this->doctor->fresh()->primary_site_id);
    }

    public function test_row_hospital_change_is_rejected_without_partial_changes_when_a_placed_week_is_unavailable(): void
    {
        $secondSite = TrainingSite::factory()->create(['is_active' => true]);
        $this->doctor->trainingSites()->attach($secondSite->id);
        $this->doctor->availabilities()->createMany([
            ['training_site_id' => $this->doctor->primary_site_id, 'day' => 'tuesday', 'status' => 'work', 'available_from' => '2026-09-01', 'available_until' => '2026-09-07'],
            ['training_site_id' => $secondSite->id, 'day' => 'wednesday', 'status' => 'work', 'available_from' => '2026-09-08', 'available_until' => '2026-09-14'],
        ]);
        $created = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id, 'academic_level' => 'fourth', 'course_id' => $this->course->id,
            'start_date' => '2026-09-01', 'weeks_count' => 2,
        ])->assertCreated();
        $versionId = $created->json('data.version.id');
        $rowId = $this->postJson("/api/v1/course-distribution/versions/{$versionId}/rows", [
            'row_type' => 'doctor', 'person_id' => $this->doctor->id, 'training_site_id' => $this->doctor->primary_site_id,
        ])->assertCreated()->json('data.id');
        $block = RotationBlock::where('rotation_id', $created->json('data.rotation.id'))->orderBy('from_week')->firstOrFail();
        $this->putJson("/api/v1/course-distribution/versions/{$versionId}/cell", [
            'rotation_block_id' => $block->id, 'course_schedule_row_id' => $rowId, 'subgroup_id' => $this->subgroup->id,
        ])->assertOk();
        $this->putJson("/api/v1/course-distribution/versions/{$versionId}/rows/{$rowId}", [
            'row_type' => 'doctor', 'person_id' => $this->doctor->id, 'training_site_id' => $secondSite->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('training_site_id');
        $this->assertDatabaseHas('course_schedule_rows', ['id' => $rowId, 'training_site_id' => $this->doctor->primary_site_id]);
        $this->assertDatabaseMissing('course_schedule_cells', ['course_schedule_row_id' => $rowId, 'training_site_id' => $secondSite->id]);
        $this->assertDatabaseMissing('student_clinical_assignments', ['course_schedule_row_id' => $rowId, 'training_site_id' => $secondSite->id]);
    }

    public function test_one_weekly_group_follows_a_supervisor_between_two_hospitals_without_duplicate_assignments(): void
    {
        $secondSite = TrainingSite::factory()->create(['is_active' => true, 'name_ar' => 'المستشفى الثاني', 'name_en' => 'Second Hospital']);
        $primarySiteId = (int) $this->doctor->primary_site_id;
        $this->doctor->trainingSites()->attach($secondSite->id);
        foreach ([$primarySiteId => ['sunday','monday','tuesday'], $secondSite->id => ['wednesday','thursday']] as $siteId => $days) {
            foreach ($days as $day) $this->doctor->availabilities()->create(['training_site_id' => $siteId, 'day' => $day, 'status' => 'work', 'available_from' => '2026-08-30', 'available_until' => '2026-09-05']);
        }
        $created = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id, 'academic_level' => 'fourth', 'course_id' => $this->course->id,
            'start_date' => '2026-08-30', 'weeks_count' => 1,
        ])->assertCreated();
        $versionId = $created->json('data.version.id');
        $rowId = $this->postJson("/api/v1/course-distribution/versions/{$versionId}/rows", [
            'row_type' => 'doctor', 'person_id' => $this->doctor->id, 'training_site_id' => $primarySiteId, 'follow_supervisor_workplaces' => true,
        ])->assertCreated()->assertJsonCount(2, 'data.workplace_schedule.locations')->json('data.id');
        $block = RotationBlock::where('rotation_id', $created->json('data.rotation.id'))->firstOrFail();
        $this->putJson("/api/v1/course-distribution/versions/{$versionId}/cell", [
            'rotation_block_id' => $block->id, 'course_schedule_row_id' => $rowId, 'subgroup_id' => $this->subgroup->id,
        ])->assertOk();
        $this->assertSame(2, StudentClinicalAssignment::where('distribution_version_id', $versionId)->count());
        $this->assertSame(1, CourseScheduleCell::where('distribution_version_id', $versionId)->count());
        $this->completeApproval($versionId);
        $version = DistributionVersion::findOrFail($versionId);
        $this->actingAs($this->user)->postJson("/api/v1/distribution-versions/{$versionId}/publish", ['last_updated_at' => $version->updated_at->toIso8601String()])->assertOk();
        $query = app(\App\Services\Distribution\ClinicalScheduleQueryService::class);
        $student = Student::where('academic_year_id', $this->year->id)->firstOrFail();
        $weekly = $query->getStudentSchedule($student);
        $this->assertCount(1, $weekly);
        $this->assertCount(2, $weekly[0]['training_sites']);
        foreach (['2026-08-30' => $primarySiteId, '2026-08-31' => $primarySiteId, '2026-09-01' => $primarySiteId, '2026-09-02' => $secondSite->id, '2026-09-03' => $secondSite->id] as $date => $siteId) {
            $daily = $query->getDailyGroups($date, $siteId);
            $this->assertCount(1, $daily);
            $this->assertCount(2, $daily[0]['students']);
            $otherSiteId = $siteId === $primarySiteId ? $secondSite->id : $primarySiteId;
            $this->assertCount(0, $query->getDailyGroups($date, $otherSiteId));
        }
        $this->assertCount(0, $query->getDailyGroups('2026-09-04'));
        $admin = $query->getAdministrativeSchedule(\Illuminate\Http\Request::create('/', 'GET', ['training_site_id' => $secondSite->id]));
        $this->assertSame(2, $admin->total());
        $this->assertCount(2, $admin->items()[0]['training_sites']);
        $report = app(\App\Services\Reports\ReportCenterService::class)->report('clinical_training_sites_sep_nov_2026', ['academic_year_id' => $this->year->id, 'month_from' => '2026-08', 'month_to' => '2026-09']);
        $secondRow = collect($report['rows'])->first(fn ($row) => $row[0] === 'المستشفى الثاني');
        $this->assertSame(0, $secondRow[1]); // no August duty at the second hospital
        $this->assertSame(2, $secondRow[5]); // both students train there in September

        $supervisorRole = Role::where('code','CLINICAL_SUPERVISOR')->firstOrFail();
        $supervisorRole->permissions()->syncWithoutDetaching(Permission::whereIn('code',['attendance.record','supervisor.workspace.view'])->pluck('id')->mapWithKeys(fn ($id)=>[$id=>['scope_type'=>'global']])->all());
        $supervisor = $this->doctor->user;
        $assignment = StudentClinicalAssignment::where('distribution_version_id',$versionId)->firstOrFail();
        $records = StudentClinicalAssignment::where('distribution_version_id',$versionId)->get()->map(fn ($item)=>['student_id'=>$item->student_id,'status'=>'present'])->all();
        $this->actingAs($supervisor)->postJson('/api/v1/operational/my-supervisor-attendance', ['assignment_id'=>$assignment->id,'session_date'=>'2026-09-02','records'=>$records])->assertOk();
        $this->assertDatabaseHas('clinical_sessions',['rotation_block_id'=>$block->id,'training_site_id'=>$secondSite->id,'session_date'=>'2026-09-02 00:00:00']);
        $this->getJson('/api/v1/operational/my-supervisor-attendance?assignment_id='.$assignment->id.'&session_date=2026-09-02')->assertOk()->assertJsonCount(2,'data.records');
        $this->getJson('/api/v1/operational/my-supervisor-workspace')->assertOk()->assertJsonCount(5,'data.assignments.0.scheduled_dates')->assertJsonCount(2,'data.assignments.0.training_sites');
        $qr = app(\App\Services\ClinicalAttendance\QrAttendanceService::class)->open($supervisor,$assignment->id,'2026-09-03');
        $this->assertSame($secondSite->id,(int)$qr->training_site_id);
        $this->assertCount(2,$qr->roster);
        $this->assertSame($primarySiteId,(int)$assignment->fresh()->training_site_id);
        $this->assertSame(2,StudentClinicalAssignment::where('distribution_version_id',$versionId)->count());

        // Published site/day snapshots do not change when the profile is edited later.
        $this->doctor->availabilities()->delete();
        $this->actingAs($this->user);
        $this->assertCount(1,$query->getDailyGroups('2026-09-02',$secondSite->id));
        $review = Permission::where('code','attendance.review')->firstOrFail();
        Role::where('code','COURSE_DISTRIBUTOR_TEST')->firstOrFail()->permissions()->syncWithoutDetaching([$review->id=>['scope_type'=>'global']]);
        $this->actingAs($this->user->fresh())->getJson('/api/v1/attendance-records/group-summary?assignment_id='.$assignment->id.'&week=1')
            ->assertOk()->assertJsonCount(2,'data.schedule')->assertJsonPath('data.students.0.totals.scheduled_days',5)
            ->assertJsonPath('data.students.0.totals.present',1);
        $mark = \App\Models\ClinicalAssessment::create([
            'student_id'=>$assignment->student_id,'evaluator_person_id'=>$this->doctor->id,'student_clinical_assignment_id'=>$assignment->id,
            'evaluation_week'=>1,'assessment_kind'=>'weekly','score'=>8,'max_score'=>10,'status'=>'submitted',
        ]);
        $revisionId = $this->postJson("/api/v1/course-distribution/versions/{$versionId}/revise")->assertOk()->json('data.id');
        $this->completeApproval($revisionId);
        $revision = DistributionVersion::findOrFail($revisionId);
        $this->actingAs($this->user)->postJson("/api/v1/distribution-versions/{$revisionId}/publish",['last_updated_at'=>$revision->updated_at->toIso8601String()])->assertOk();
        $this->assertSame($revisionId,(int)$mark->fresh()->clinicalAssignment->distribution_version_id);
        $this->assertSame('8.00',$mark->fresh()->score);
        $this->assertCount(1,$query->getStudentSchedule($student));
        $this->assertCount(1,$query->getDailyGroups('2026-09-02',$secondSite->id));
    }

    public function test_period_schedule_uses_dates_for_the_selected_clinical_year_only(): void
    {
        $period = ClinicalPeriod::create([
            'academic_year_id' => $this->year->id,
            'code' => 'P1',
            'name_ar' => 'الفترة الأولى',
            'name_en' => 'First Period',
            'sequence' => 1,
            'start_date' => '2026-08-01',
            'end_date' => '2026-11-23',
            'weeks_count' => 12,
            'status' => 'active',
        ]);
        $period->levelDates()->createMany([
            ['academic_level' => 'fourth', 'start_date' => '2026-09-01', 'end_date' => '2026-11-23', 'weeks_count' => 12],
            ['academic_level' => 'fifth', 'start_date' => '2026-09-01', 'end_date' => '2026-11-23', 'weeks_count' => 12],
            ['academic_level' => 'sixth', 'start_date' => '2026-08-01', 'end_date' => '2026-10-23', 'weeks_count' => 12],
        ]);

        $this->actingAs($this->user)->getJson('/api/v1/course-distribution/options')
            ->assertOk()
            ->assertJsonPath('data.clinical_periods.0.level_dates.0.academic_level', 'fourth')
            ->assertJsonPath('data.clinical_periods.0.level_dates.0.start_date', '2026-09-01')
            ->assertJsonPath('data.clinical_periods.0.level_dates.2.start_date', '2026-08-01');

        $payload = [
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'course_id' => $this->course->id,
            'clinical_period_id' => $period->id,
            'schedule_scope' => 'period',
            'start_date' => '2026-08-01',
            'weeks_count' => 12,
        ];
        $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('start_date');

        $payload['start_date'] = '2026-09-01';
        $created = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', $payload)
            ->assertCreated();
        $this->assertSame(
            '2026-09-01',
            Rotation::findOrFail($created->json('data.rotation.id'))->start_date->toDateString(),
        );
    }

    public function test_rta_distribution_options_and_operations_are_limited_to_assigned_cohort(): void
    {
        $rtaRole = Role::where('code', 'RTA')->firstOrFail();
        $permissionIds = Permission::whereIn('code', [
            'distribution.view',
            'distribution.update',
            'distribution.schedule_rows.manage',
            'distribution.approve',
            'distribution.publish',
            'rotations.create',
        ])->pluck('id');
        $rtaRole->permissions()->syncWithoutDetaching(
            $permissionIds->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all()
        );
        $rta = User::factory()->create(['assigned_levels' => ['fourth']]);
        $rta->roles()->attach($rtaRole->id);
        $fifthCourse = Course::where('academic_level', 'fifth')->firstOrFail();

        $options = $this->actingAs($rta)->getJson('/api/v1/course-distribution/options')
            ->assertOk();
        $this->assertSame(['fourth'], collect($options->json('data.courses'))->pluck('academic_level')->unique()->values()->all());
        $this->assertNotContains($fifthCourse->id, collect($options->json('data.courses'))->pluck('id')->all());

        $this->actingAs($rta)->getJson('/api/v1/course-distribution/schedule?academic_year_id='.$this->year->id.'&academic_level=fifth&course_id='.$fifthCourse->id)
            ->assertNotFound();
        $this->actingAs($rta)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fifth',
            'course_id' => $fifthCourse->id,
            'start_date' => '2026-09-01',
            'weeks_count' => 2,
        ])->assertNotFound();

        $rotation = Rotation::factory()->create([
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fifth',
            'course_id' => $fifthCourse->id,
        ]);
        $version = DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'name' => 'جدول الخامسة',
            'status' => 'manual',
        ]);
        $this->actingAs($rta)->postJson("/api/v1/course-distribution/versions/{$version->id}/rows", [
            'row_type' => 'vacancy',
            'training_site_id' => $this->doctor->primary_site_id,
            'label' => 'شاغر',
        ])->assertNotFound();
        $this->actingAs($rta)->postJson("/api/v1/distribution-versions/{$version->id}/approve")
            ->assertNotFound();
        $this->actingAs($rta)->postJson("/api/v1/distribution-versions/{$version->id}/publish", [
            'last_updated_at' => $version->updated_at->toIso8601String(),
        ])->assertNotFound();
        $this->actingAs($rta)->getJson('/api/v1/distribution-versions?per_page=100')
            ->assertOk()
            ->assertJsonCount(0, 'data.data');
    }

    public function test_can_create_weekly_course_schedule_and_assign_a_group_to_doctor_cell(): void
    {
        $created = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'course_id' => $this->course->id,
            'start_date' => '2026-09-01',
            'weeks_count' => 3,
        ])->assertCreated();

        $versionId = $created->json('data.version.id');
        $emptySchedule = $this->actingAs($this->user)->getJson('/api/v1/course-distribution/schedule?academic_year_id='.$this->year->id.'&academic_level=fourth&course_id='.$this->course->id)
            ->assertOk()->assertJsonCount(3, 'data.blocks')->assertJsonCount(0, 'data.rows')->assertJsonPath('data.subgroups.0.name', 'L1')
            ->assertJsonPath('data.approval_state.status', 'required');
        $rowId = $this->actingAs($this->user)->postJson("/api/v1/course-distribution/versions/{$versionId}/rows", [
            'row_type' => 'doctor',
            'person_id' => $this->doctor->id,
            'training_site_id' => $this->doctor->primary_site_id,
        ])->assertCreated()->json('data.id');
        $schedule = $this->actingAs($this->user)->getJson('/api/v1/course-distribution/schedule?academic_year_id='.$this->year->id.'&academic_level=fourth&course_id='.$this->course->id)
            ->assertOk()->assertJsonCount(1, 'data.rows');
        $blockId = $schedule->json('data.blocks.0.id');

        $this->actingAs($this->user)->putJson("/api/v1/course-distribution/versions/{$versionId}/cell", [
            'rotation_block_id' => $blockId,
            'course_schedule_row_id' => $rowId,
            'subgroup_id' => $this->subgroup->id,
        ])->assertOk();

        $this->assertSame(2, StudentClinicalAssignment::where('distribution_version_id', $versionId)->count());

        $secondSubgroup = StudentSubgroup::factory()->create([
            'student_group_id' => $this->subgroup->student_group_id,
            'name' => 'L2',
            'is_active' => true,
        ]);
        $secondStudent = Student::factory()->create([
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'registration_status' => 'active',
        ]);
        StudentGroupAssignment::factory()->create([
            'student_id' => $secondStudent->id,
            'academic_year_id' => $this->year->id,
            'student_group_id' => $this->subgroup->student_group_id,
            'student_subgroup_id' => $secondSubgroup->id,
            'valid_until' => null,
        ]);
        $this->actingAs($this->user)->putJson("/api/v1/course-distribution/versions/{$versionId}/cell", [
            'rotation_block_id' => $blockId,
            'course_schedule_row_id' => $rowId,
            'subgroup_ids' => [$this->subgroup->id, $secondSubgroup->id],
        ])->assertOk();

        $this->assertSame(2, CourseScheduleCell::where('distribution_version_id', $versionId)->count());
        $this->assertSame(3, StudentClinicalAssignment::where('distribution_version_id', $versionId)->count());
        $this->actingAs($this->user)->getJson('/api/v1/course-distribution/schedule?academic_year_id='.$this->year->id.'&academic_level=fourth&course_id='.$this->course->id)
            ->assertOk()
            ->assertJsonCount(2, 'data.cells')
            ->assertJsonFragment(['subgroup_name' => 'L1'])
            ->assertJsonFragment(['subgroup_name' => 'L2']);

        $this->completeApproval($versionId);
        $this->actingAs($this->user)->getJson('/api/v1/course-distribution/schedule?academic_year_id='.$this->year->id.'&academic_level=fourth&course_id='.$this->course->id)
            ->assertOk()
            ->assertJsonPath('data.approval_state.status', 'approved');
        $this->actingAs($this->user)->deleteJson("/api/v1/course-distribution/versions/{$versionId}/cell", [
            'rotation_block_id' => $blockId,
            'course_schedule_row_id' => $rowId,
        ])->assertOk();
        $this->assertDatabaseCount('student_clinical_assignments', 0);
        $this->actingAs($this->user)->getJson('/api/v1/course-distribution/schedule?academic_year_id='.$this->year->id.'&academic_level=fourth&course_id='.$this->course->id)
            ->assertOk()
            ->assertJsonPath('data.approval_state.status', 'revoked');
    }

    public function test_one_schedule_row_accepts_multiple_supervisors_with_independent_weekdays_without_touching_publication(): void
    {
        $secondUser = User::factory()->create();
        $secondUser->roles()->attach(Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail());
        $secondDoctor = Person::factory()->create([
            'user_id' => $secondUser->id,
            'email' => $secondUser->email,
            'primary_site_id' => $this->doctor->primary_site_id,
            'is_active' => true,
        ]);
        $secondDoctor->trainingSites()->attach($this->doctor->primary_site_id, ['is_primary' => true]);

        $created = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'course_id' => $this->course->id,
            'start_date' => '2026-09-01',
            'weeks_count' => 3,
        ])->assertCreated();
        $versionId = $created->json('data.version.id');

        $row = $this->actingAs($this->user)->postJson("/api/v1/course-distribution/versions/{$versionId}/rows", [
            'row_type' => 'doctor',
            'training_site_id' => $this->doctor->primary_site_id,
            'supervisors' => [
                ['person_id' => $this->doctor->id, 'weekdays' => ['saturday', 'sunday', 'monday']],
                ['person_id' => $secondDoctor->id, 'weekdays' => ['tuesday', 'wednesday', 'thursday']],
            ],
        ])->assertCreated();

        $rowId = $row->json('data.id');
        $this->assertDatabaseHas('course_schedule_rows', [
            'id' => $rowId,
            'person_id' => $this->doctor->id,
        ]);
        $this->assertDatabaseHas('course_schedule_row_supervisors', [
            'course_schedule_row_id' => $rowId,
            'person_id' => $secondDoctor->id,
        ]);
        $this->assertDatabaseCount('course_schedule_row_supervisors', 2);
        $this->assertSame('manual', DistributionVersion::findOrFail($versionId)->status);
        $this->assertSame(0, DistributionVersion::where('rotation_id', $created->json('data.rotation.id'))->where('status', 'published')->count());

        $this->actingAs($this->user)->getJson('/api/v1/course-distribution/schedule?academic_year_id='.$this->year->id.'&academic_level=fourth&course_id='.$this->course->id)
            ->assertOk()
            ->assertJsonCount(2, 'data.rows.0.supervisors')
            ->assertJsonPath('data.rows.0.supervisors.0.weekdays', ['saturday', 'sunday', 'monday'])
            ->assertJsonPath('data.rows.0.supervisors.1.weekdays', ['tuesday', 'wednesday', 'thursday']);

        DistributionVersion::whereKey($versionId)->update(['status' => 'published', 'is_current' => true]);
        $this->actingAs($this->user)->putJson("/api/v1/course-distribution/versions/{$versionId}/rows/{$rowId}", [
            'row_type' => 'doctor',
            'training_site_id' => $this->doctor->primary_site_id,
            'supervisors' => [['person_id' => $this->doctor->id, 'weekdays' => ['saturday']]],
        ])->assertUnprocessable()->assertJsonValidationErrors('version');
        $this->assertDatabaseCount('course_schedule_row_supervisors', 2);

        $revision = $this->actingAs($this->user)
            ->postJson("/api/v1/course-distribution/versions/{$versionId}/revise")
            ->assertOk()
            ->assertJsonPath('data.status', 'manual');
        $revisionRowId = CourseScheduleRow::where('distribution_version_id', $revision->json('data.id'))->value('id');
        $this->assertSame(2, DB::table('course_schedule_row_supervisors')->where('course_schedule_row_id', $revisionRowId)->count());
        $this->assertSame(1, DistributionVersion::where('rotation_id', $created->json('data.rotation.id'))->where('status', 'published')->count());
    }

    public function test_approval_only_requires_students_from_groups_targeted_by_this_schedule(): void
    {
        $otherGroup = StudentGroup::factory()->create([
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'name' => 'M',
        ]);
        $otherSubgroup = StudentSubgroup::factory()->create([
            'student_group_id' => $otherGroup->id,
            'name' => 'M1',
            'is_active' => true,
        ]);
        $otherStudent = Student::factory()->create([
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'registration_status' => 'active',
        ]);
        StudentGroupAssignment::factory()->create([
            'student_id' => $otherStudent->id,
            'academic_year_id' => $this->year->id,
            'student_group_id' => $otherGroup->id,
            'student_subgroup_id' => $otherSubgroup->id,
            'valid_until' => null,
        ]);

        $created = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'course_id' => $this->course->id,
            'start_date' => '2026-09-01',
            'weeks_count' => 2,
        ])->assertCreated();
        $versionId = $created->json('data.version.id');
        $rowId = $this->actingAs($this->user)->postJson("/api/v1/course-distribution/versions/{$versionId}/rows", [
            'row_type' => 'doctor',
            'person_id' => $this->doctor->id,
            'training_site_id' => $this->doctor->primary_site_id,
        ])->assertCreated()->json('data.id');
        $blockId = Rotation::where('course_id', $this->course->id)->firstOrFail()->blocks()->orderBy('from_week')->value('id');

        $this->actingAs($this->user)->putJson("/api/v1/course-distribution/versions/{$versionId}/cell", [
            'rotation_block_id' => $blockId,
            'course_schedule_row_id' => $rowId,
            'subgroup_id' => $this->subgroup->id,
        ])->assertOk();

        $this->actingAs($this->user)->getJson("/api/v1/distribution-versions/{$versionId}/unassigned")
            ->assertOk()
            ->assertJsonMissing(['id' => $otherStudent->id]);
        $this->completeApproval($versionId);
    }

    private function completeApproval(int $versionId): void
    {
        $this->actingAs($this->user)->postJson("/api/v1/distribution-versions/{$versionId}/approve")->assertOk();
        $deanRole = Role::where('code', 'DEAN')->firstOrFail();
        foreach (Permission::whereIn('code', ['distribution.approve', 'approvals.decide'])->get() as $permission) {
            $deanRole->permissions()->syncWithoutDetaching([$permission->id => ['scope_type' => 'global']]);
        }
        $dean = User::factory()->create();
        $dean->roles()->attach($deanRole);
        $this->actingAs($dean)->postJson("/api/v1/distribution-versions/{$versionId}/approve")->assertOk();
    }

    public function test_publication_approval_error_follows_the_requested_system_language(): void
    {
        $created = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'course_id' => $this->course->id,
            'start_date' => '2026-09-01',
            'weeks_count' => 2,
        ])->assertCreated();
        $version = DistributionVersion::findOrFail($created->json('data.version.id'));
        $payload = ['last_updated_at' => $version->updated_at->toIso8601String()];

        $this->withHeader('Accept-Language', 'ar')
            ->postJson("/api/v1/distribution-versions/{$version->id}/publish", $payload)
            ->assertUnprocessable()
            ->assertJsonPath('errors.approval.0', 'الجدول غير معتمد حالياً. اعتمده مجدداً بعد إنهاء آخر التعديلات، ثم نفّذ النشر.');

        $this->withHeader('Accept-Language', 'en')
            ->postJson("/api/v1/distribution-versions/{$version->id}/publish", $payload)
            ->assertUnprocessable()
            ->assertJsonPath('errors.approval.0', 'This schedule is not currently approved. Approve it again after completing the latest changes, then publish it.');
    }

    public function test_approval_fingerprint_is_stable_for_students_assigned_across_multiple_weeks(): void
    {
        $weekOne = ['student_id' => 10, 'student_subgroup_id' => 3, 'rotation_block_id' => 1, 'training_site_id' => 2, 'department_id' => 4, 'supervisor_id' => 5];
        $weekTwo = ['student_id' => 10, 'student_subgroup_id' => 3, 'rotation_block_id' => 2, 'training_site_id' => 2, 'department_id' => 4, 'supervisor_id' => 5];
        $service = app(DistributionApprovalService::class);

        $this->assertSame(
            $service->generateFingerprint([$weekOne, $weekTwo]),
            $service->generateFingerprint([$weekTwo, $weekOne]),
        );
    }

    public function test_schedule_must_fit_inside_the_selected_academic_year(): void
    {
        $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'course_id' => $this->course->id,
            'start_date' => '2027-07-15',
            'weeks_count' => 4,
        ])->assertUnprocessable()->assertJsonValidationErrors('start_date');

        $this->assertDatabaseCount('rotations', 0);
    }

    public function test_current_published_schedule_is_preferred_over_a_withdrawn_history_version(): void
    {
        $rotation = Rotation::factory()->create([
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'course_id' => $this->course->id,
        ]);
        $published = DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'name' => 'النسخة الحالية',
            'status' => 'published',
            'is_current' => true,
        ]);
        DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'name' => 'نسخة ملغاة قديمة',
            'status' => 'withdrawn',
            'is_current' => false,
        ]);

        $this->actingAs($this->user)->getJson('/api/v1/course-distribution/schedule?academic_year_id='.$this->year->id.'&academic_level=fourth&course_id='.$this->course->id)
            ->assertOk()
            ->assertJsonPath('data.version.id', $published->id)
            ->assertJsonPath('data.version.status', 'published');
    }

    public function test_empty_subgroup_can_be_scheduled_and_later_members_inherit_the_placement(): void
    {
        $emptySubgroup = StudentSubgroup::factory()->create([
            'student_group_id' => $this->subgroup->student_group_id,
            'name' => 'L2',
            'is_active' => true,
        ]);
        $created = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'course_id' => $this->course->id,
            'start_date' => '2026-09-01',
            'weeks_count' => 1,
        ])->assertCreated();
        $versionId = $created->json('data.version.id');
        $rowId = $this->actingAs($this->user)->postJson("/api/v1/course-distribution/versions/{$versionId}/rows", [
            'row_type' => 'doctor',
            'person_id' => $this->doctor->id,
            'training_site_id' => $this->doctor->primary_site_id,
        ])->assertCreated()->json('data.id');
        $blockId = DistributionVersion::findOrFail($versionId)->rotation->blocks()->firstOrFail()->id;

        $this->actingAs($this->user)->putJson("/api/v1/course-distribution/versions/{$versionId}/cell", [
            'rotation_block_id' => $blockId,
            'course_schedule_row_id' => $rowId,
            'subgroup_id' => $emptySubgroup->id,
        ])->assertOk();

        $this->assertDatabaseHas('course_schedule_cells', [
            'distribution_version_id' => $versionId,
            'course_schedule_row_id' => $rowId,
            'student_subgroup_id' => $emptySubgroup->id,
        ]);
        $this->assertSame(0, StudentClinicalAssignment::where('student_subgroup_id', $emptySubgroup->id)->count());
        $this->actingAs($this->user)->getJson('/api/v1/course-distribution/schedule?academic_year_id='.$this->year->id.'&academic_level=fourth&course_id='.$this->course->id)
            ->assertOk()
            ->assertJsonPath('data.cells.0.subgroup_id', $emptySubgroup->id);

        $student = Student::factory()->create([
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'registration_status' => 'active',
        ]);
        StudentGroupAssignment::factory()->create([
            'student_id' => $student->id,
            'academic_year_id' => $this->year->id,
            'student_group_id' => $emptySubgroup->student_group_id,
            'student_subgroup_id' => $emptySubgroup->id,
            'valid_until' => null,
        ]);
        app(CourseScheduleMembershipSyncService::class)->syncStudent($student->id, $this->year->id);

        $this->assertDatabaseHas('student_clinical_assignments', [
            'student_id' => $student->id,
            'distribution_version_id' => $versionId,
            'course_schedule_row_id' => $rowId,
            'student_subgroup_id' => $emptySubgroup->id,
        ]);

        $assignment = StudentClinicalAssignment::where('student_id', $student->id)
            ->where('distribution_version_id', $versionId)->firstOrFail();
        $mark = \App\Models\ClinicalAssessment::create([
            'student_id' => $student->id, 'evaluator_person_id' => $this->doctor->id,
            'student_clinical_assignment_id' => $assignment->id,
            'evaluation_week' => 1, 'assessment_kind' => 'weekly',
            'score' => 8, 'max_score' => 10, 'status' => 'submitted',
        ]);
        app(CourseScheduleMembershipSyncService::class)->syncStudent($student->id, $this->year->id);
        $this->assertSame($assignment->id, $mark->fresh()->student_clinical_assignment_id);

        $this->assertSame(1, StudentClinicalAssignment::where('student_id', $student->id)
            ->where('distribution_version_id', $versionId)->count());

        StudentGroupAssignment::where('student_id', $student->id)->update(['valid_until' => now()->toDateString()]);
        try {
            app(CourseScheduleMembershipSyncService::class)->syncStudent($student->id, $this->year->id);
            $this->fail('A scored assignment must not be removed by roster sync.');
        } catch (\Illuminate\Validation\ValidationException $exception) {
            $this->assertArrayHasKey('student_subgroup_id', $exception->errors());
        }
        $this->assertSame($assignment->id, $mark->fresh()->student_clinical_assignment_id);
    }

    public function test_membership_filter_does_not_resurrect_a_superseded_group_for_a_period(): void
    {
        $old = StudentGroupAssignment::where('student_subgroup_id', $this->subgroup->id)->firstOrFail();
        $other = StudentSubgroup::factory()->create(['student_group_id' => $this->subgroup->student_group_id, 'name' => 'L9']);
        $period = ClinicalPeriod::create([
            'academic_year_id' => $this->year->id, 'code' => 'P2', 'name_ar' => 'Period two', 'sequence' => 2,
            'start_date' => '2026-11-24', 'end_date' => '2027-02-15', 'weeks_count' => 12, 'status' => 'active',
        ]);
        $old->update(['valid_until' => '2026-11-23']);
        StudentGroupAssignment::create([
            'student_id' => $old->student_id, 'academic_year_id' => $this->year->id,
            'student_group_id' => $other->student_group_id, 'student_subgroup_id' => $other->id,
            'effective_from_clinical_period_id' => $period->id, 'valid_from' => '2026-11-24',
        ]);
        $rotation = Rotation::factory()->create([
            'academic_year_id' => $this->year->id, 'academic_level' => 'fourth',
            'course_id' => $this->course->id, 'clinical_period_id' => $period->id,
        ]);
        $resolver = app(\App\Services\Distribution\ClinicalPeriodGroupMembershipService::class);
        $this->assertFalse($resolver->membershipsForRotation($rotation, [$this->subgroup->id])->pluck('student_id')->contains($old->student_id));
        $this->assertTrue($resolver->membershipsForRotation($rotation, [$other->id])->pluck('student_id')->contains($old->student_id));
    }

    public function test_cell_save_preserves_assessment_links_and_reports_student_assignment_conflicts(): void
    {
        $created = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id, 'academic_level' => 'fourth', 'course_id' => $this->course->id,
            'start_date' => '2026-09-01', 'weeks_count' => 1,
        ])->assertCreated();
        $version = DistributionVersion::findOrFail($created->json('data.version.id'));
        $block = $version->rotation->blocks()->firstOrFail();
        $row = CourseScheduleRow::create([
            'distribution_version_id' => $version->id, 'row_type' => 'doctor',
            'person_id' => $this->doctor->id, 'training_site_id' => $this->doctor->primary_site_id,
        ]);
        $url = '/api/v1/course-distribution/versions/'.$version->id.'/cell';
        $payload = ['rotation_block_id' => $block->id, 'course_schedule_row_id' => $row->id, 'subgroup_id' => $this->subgroup->id];
        $this->putJson($url, $payload)->assertOk();
        $assignment = StudentClinicalAssignment::where('distribution_version_id', $version->id)->firstOrFail();
        $mark = \App\Models\ClinicalAssessment::create([
            'student_id' => $assignment->student_id, 'evaluator_person_id' => $this->doctor->id,
            'student_clinical_assignment_id' => $assignment->id, 'evaluation_week' => 1,
            'assessment_kind' => 'weekly', 'score' => 8, 'max_score' => 10, 'status' => 'submitted',
        ]);
        $this->putJson($url, $payload)->assertOk();
        $this->assertSame($assignment->id, $mark->fresh()->student_clinical_assignment_id);

        $secondSite = TrainingSite::factory()->create(['is_active' => true]);
        $this->doctor->trainingSites()->attach($secondSite->id);
        $this->putJson("/api/v1/course-distribution/versions/{$version->id}/rows/{$row->id}", [
            'row_type' => 'doctor', 'person_id' => $this->doctor->id, 'training_site_id' => $secondSite->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('training_site_id');
        $this->assertSame((int) $this->doctor->primary_site_id, $row->fresh()->training_site_id);
        $this->assertSame((int) $this->doctor->primary_site_id, $assignment->fresh()->training_site_id);
        $this->assertSame((int) $this->doctor->primary_site_id, CourseScheduleCell::where('course_schedule_row_id', $row->id)->value('training_site_id'));
        $this->assertSame($assignment->id, $mark->fresh()->student_clinical_assignment_id);

        $empty = StudentSubgroup::factory()->create(['student_group_id' => $this->subgroup->student_group_id, 'name' => 'L8']);
        $this->putJson($url, array_replace($payload, ['subgroup_id' => $empty->id]))
            ->assertUnprocessable()->assertJsonValidationErrors('subgroup_ids');
        $this->assertDatabaseHas('course_schedule_cells', ['distribution_version_id' => $version->id, 'student_subgroup_id' => $this->subgroup->id]);
        $this->assertSame($assignment->id, $mark->fresh()->student_clinical_assignment_id);

        // A stale assignment on another row must produce a clear 422, never a
        // duplicate-key 500 or an automatic overwrite of the other placement.
        $otherRow = CourseScheduleRow::create([
            'distribution_version_id' => $version->id, 'row_type' => 'vacancy',
            'label' => 'Other row', 'training_site_id' => $this->doctor->primary_site_id,
        ]);
        $unscored = StudentClinicalAssignment::where('distribution_version_id', $version->id)->where('id', '!=', $assignment->id)->firstOrFail();
        $unscored->update(['course_schedule_row_id' => $otherRow->id]);
        $this->putJson($url, $payload)->assertUnprocessable()->assertJsonValidationErrors('subgroup_ids');
        $this->assertSame($otherRow->id, $unscored->fresh()->course_schedule_row_id);
        $this->assertSame($assignment->id, $mark->fresh()->student_clinical_assignment_id);
    }

    public function test_period_effective_transfer_preserves_old_assessments_and_moves_only_future_periods(): void
    {
        $oldMembership = StudentGroupAssignment::query()
            ->where('student_subgroup_id', $this->subgroup->id)
            ->firstOrFail();
        $newSubgroup = StudentSubgroup::factory()->create([
            'student_group_id' => $this->subgroup->student_group_id,
            'name' => 'L2',
            'is_active' => true,
        ]);
        $periodOne = ClinicalPeriod::create([
            'academic_year_id' => $this->year->id, 'code' => 'P1', 'name_ar' => 'الفترة الأولى',
            'name_en' => 'First period', 'sequence' => 1, 'start_date' => '2026-09-01',
            'end_date' => '2026-11-23', 'weeks_count' => 12, 'status' => 'closed',
        ]);
        $periodTwo = ClinicalPeriod::create([
            'academic_year_id' => $this->year->id, 'code' => 'P2', 'name_ar' => 'الفترة الثانية',
            'name_en' => 'Second period', 'sequence' => 2, 'start_date' => '2026-11-24',
            'end_date' => '2027-02-15', 'weeks_count' => 12, 'status' => 'active',
        ]);

        $makeScheduledPeriod = function (ClinicalPeriod $period, StudentSubgroup $subgroup): DistributionVersion {
            $rotation = Rotation::where('academic_year_id', $this->year->id)->where('course_id', $this->course->id)
                ->where('clinical_period_id', $period->id)->first() ?? Rotation::factory()->create([
                'academic_year_id' => $this->year->id,
                'academic_level' => 'fourth',
                'course_id' => $this->course->id,
                'clinical_period_id' => $period->id,
                'schedule_scope' => 'period',
                'start_date' => $period->start_date,
                'end_date' => $period->end_date,
            ]);
            $version = DistributionVersion::create([
                'rotation_id' => $rotation->id,
                'name' => $period->code,
                'status' => 'published',
                'is_current' => true,
            ]);
            $block = RotationBlock::factory()->create(['rotation_id' => $rotation->id, 'from_week' => 1, 'to_week' => 1]);
            $row = CourseScheduleRow::create([
                'distribution_version_id' => $version->id,
                'row_type' => 'doctor',
                'person_id' => $this->doctor->id,
                'training_site_id' => $this->doctor->primary_site_id,
            ]);
            CourseScheduleCell::create([
                'distribution_version_id' => $version->id,
                'course_schedule_row_id' => $row->id,
                'rotation_block_id' => $block->id,
                'student_subgroup_id' => $subgroup->id,
                'training_site_id' => $this->doctor->primary_site_id,
            ]);

            return $version;
        };

        $periodOneVersion = $makeScheduledPeriod($periodOne, $this->subgroup);
        $periodTwoOldVersion = $makeScheduledPeriod($periodTwo, $this->subgroup);
        $periodTwoNewVersion = $makeScheduledPeriod($periodTwo, $newSubgroup);
        app(CourseScheduleMembershipSyncService::class)->syncStudent($oldMembership->student_id, $this->year->id);

        $oldClinicalAssignment = StudentClinicalAssignment::query()
            ->where('student_id', $oldMembership->student_id)
            ->where('distribution_version_id', $periodOneVersion->id)
            ->firstOrFail();
        $mark = \App\Models\ClinicalAssessment::create([
            'student_id' => $oldMembership->student_id,
            'evaluator_person_id' => $this->doctor->id,
            'student_clinical_assignment_id' => $oldClinicalAssignment->id,
            'evaluation_week' => 1,
            'assessment_kind' => 'weekly',
            'score' => 8,
            'max_score' => 10,
            'status' => 'submitted',
        ]);
        $periodOneVersion->update(['status' => 'withdrawn', 'is_current' => false]);

        DB::transaction(function () use ($oldMembership, $newSubgroup, $periodTwo) {
            $oldMembership->update([
                'valid_until' => '2026-11-23',
                'effective_until_clinical_period_id' => $periodTwo->id,
            ]);
            StudentGroupAssignment::create([
                'student_id' => $oldMembership->student_id,
                'academic_year_id' => $this->year->id,
                'student_group_id' => $newSubgroup->student_group_id,
                'student_subgroup_id' => $newSubgroup->id,
                'valid_from' => '2026-11-24',
                'effective_from_clinical_period_id' => $periodTwo->id,
                'data_source' => 'administrative_override',
            ]);
            app(CourseScheduleMembershipSyncService::class)->syncStudent($oldMembership->student_id, $this->year->id, $periodTwo->id);
        });

        $this->assertDatabaseHas('student_clinical_assignments', [
            'id' => $oldClinicalAssignment->id,
            'student_subgroup_id' => $this->subgroup->id,
            'distribution_version_id' => $periodOneVersion->id,
        ]);
        $this->assertSame($oldClinicalAssignment->id, $mark->fresh()->student_clinical_assignment_id);
        $this->assertDatabaseMissing('student_clinical_assignments', [
            'student_id' => $oldMembership->student_id,
            'distribution_version_id' => $periodTwoOldVersion->id,
        ]);
        $this->assertDatabaseHas('student_clinical_assignments', [
            'student_id' => $oldMembership->student_id,
            'distribution_version_id' => $periodTwoNewVersion->id,
            'student_subgroup_id' => $newSubgroup->id,
        ]);
    }

    public function test_copying_period_can_map_a_main_group_distribution_to_another_groups_matching_subgroups(): void
    {
        $sourceGroup = StudentGroup::findOrFail($this->subgroup->student_group_id);
        $sourceSubgroupTwo = StudentSubgroup::factory()->create(['student_group_id' => $sourceGroup->id, 'name' => 'L2', 'is_active' => true]);
        $targetGroup = StudentGroup::factory()->create(['academic_year_id' => $this->year->id, 'academic_level' => 'fourth', 'name' => 'M']);
        $targetSubgroupOne = StudentSubgroup::factory()->create(['student_group_id' => $targetGroup->id, 'name' => 'M1', 'is_active' => true]);
        $targetSubgroupTwo = StudentSubgroup::factory()->create(['student_group_id' => $targetGroup->id, 'name' => 'M2', 'is_active' => true]);
        $targetStudent = Student::factory()->create(['academic_year_id' => $this->year->id, 'academic_level' => 'fourth', 'registration_status' => 'active']);
        StudentGroupAssignment::factory()->create(['student_id' => $targetStudent->id, 'academic_year_id' => $this->year->id, 'student_group_id' => $targetGroup->id, 'student_subgroup_id' => $targetSubgroupOne->id, 'valid_until' => null]);

        $makePeriodVersion = function (int $sequence, string $code, string $name, string $start): array {
            $period = ClinicalPeriod::create([
                'academic_year_id' => $this->year->id, 'code' => $code, 'name_ar' => $name, 'name_en' => $name,
                'sequence' => $sequence, 'start_date' => $start, 'end_date' => date('Y-m-d', strtotime($start.' + 13 days')),
                'weeks_count' => 2, 'status' => 'active',
            ]);
            $rotation = Rotation::create([
                'academic_year_id' => $this->year->id, 'course_id' => $this->course->id, 'clinical_period_id' => $period->id,
                'schedule_scope' => 'period', 'code' => 'COPY'.$sequence, 'name' => $name, 'academic_level' => 'fourth',
                'duration_weeks' => 2, 'start_date' => $start, 'end_date' => date('Y-m-d', strtotime($start.' + 13 days')), 'status' => 'draft',
            ]);
            $version = DistributionVersion::create(['rotation_id' => $rotation->id, 'name' => $name, 'status' => 'manual', 'is_current' => true]);
            $blocks = collect([1, 2])->map(fn ($week) => RotationBlock::create([
                'rotation_id' => $rotation->id, 'block_code' => 'W'.$week, 'from_week' => $week, 'to_week' => $week,
            ]));
            return [$version, $blocks];
        };

        [$sourceVersion, $sourceBlocks] = $makePeriodVersion(1, 'CP1', 'Source', '2026-09-01');
        [$targetVersion, $targetBlocks] = $makePeriodVersion(2, 'CP2', 'Target', '2026-09-15');
        $sourceRow = CourseScheduleRow::create([
            'distribution_version_id' => $sourceVersion->id, 'row_type' => 'doctor', 'person_id' => $this->doctor->id,
            'training_site_id' => $this->doctor->primary_site_id, 'sort_order' => 1,
        ]);
        foreach ([[$sourceBlocks[0], $this->subgroup], [$sourceBlocks[1], $sourceSubgroupTwo]] as [$block, $subgroup]) {
            CourseScheduleCell::create([
                'distribution_version_id' => $sourceVersion->id, 'course_schedule_row_id' => $sourceRow->id,
                'rotation_block_id' => $block->id, 'student_subgroup_id' => $subgroup->id,
                'training_site_id' => $this->doctor->primary_site_id,
            ]);
        }

        $this->actingAs($this->user)->postJson('/api/v1/course-distribution/versions/'.$targetVersion->id.'/copy-period', [
            'source_version_id' => $sourceVersion->id,
        ])->assertOk()->assertJsonPath('data.created_rows', 1)->assertJsonPath('data.copied_cells', 0);
        $this->assertSame(0, CourseScheduleCell::where('distribution_version_id', $targetVersion->id)->count());

        $copyPayload = [
            'source_version_id' => $sourceVersion->id,
            'copy_group_distribution' => true,
            'source_student_group_id' => $sourceGroup->id,
            'target_student_group_id' => $targetGroup->id,
        ];
        $response = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/versions/'.$targetVersion->id.'/copy-period', $copyPayload)
            ->assertOk()->assertJsonPath('data.created_rows', 0)->assertJsonPath('data.copied_cells', 2);
        $this->actingAs($this->user)->postJson('/api/v1/course-distribution/versions/'.$targetVersion->id.'/copy-period', $copyPayload)
            ->assertOk()->assertJsonPath('data.copied_cells', 0)->assertJsonPath('data.skipped_existing_cells', 2);

        $targetRow = CourseScheduleRow::where('distribution_version_id', $targetVersion->id)->firstOrFail();
        $this->assertDatabaseHas('course_schedule_cells', [
            'distribution_version_id' => $targetVersion->id, 'course_schedule_row_id' => $targetRow->id,
            'rotation_block_id' => $targetBlocks[0]->id, 'student_subgroup_id' => $targetSubgroupOne->id,
        ]);
        $this->assertDatabaseHas('course_schedule_cells', [
            'distribution_version_id' => $targetVersion->id, 'course_schedule_row_id' => $targetRow->id,
            'rotation_block_id' => $targetBlocks[1]->id, 'student_subgroup_id' => $targetSubgroupTwo->id,
        ]);
        $this->assertDatabaseHas('student_clinical_assignments', [
            'distribution_version_id' => $targetVersion->id, 'course_schedule_row_id' => $targetRow->id,
            'rotation_block_id' => $targetBlocks[0]->id, 'student_id' => $targetStudent->id,
            'student_subgroup_id' => $targetSubgroupOne->id, 'supervisor_id' => $this->doctor->id,
        ]);
        $this->assertSame(2, $response->json('data.copied_cells'));

        $incompleteGroup = StudentGroup::factory()->create(['academic_year_id' => $this->year->id, 'academic_level' => 'fourth', 'name' => 'N']);
        StudentSubgroup::factory()->create(['student_group_id' => $incompleteGroup->id, 'name' => 'N1', 'is_active' => true]);
        $this->actingAs($this->user)->postJson('/api/v1/course-distribution/versions/'.$targetVersion->id.'/copy-period', [
            'source_version_id' => $sourceVersion->id,
            'copy_group_distribution' => true,
            'source_student_group_id' => $sourceGroup->id,
            'target_student_group_id' => $incompleteGroup->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('target_student_group_id');
        $this->assertSame(2, CourseScheduleCell::where('distribution_version_id', $targetVersion->id)->count());
        $this->assertDatabaseHas('course_schedule_rows', ['distribution_version_id' => $targetVersion->id, 'id' => $targetRow->id]);
    }

    public function test_adding_doctor_creates_linked_clinical_supervisor_account(): void
    {
        $site = TrainingSite::factory()->create(['is_active' => true]);
        $this->actingAs($this->user)->postJson('/api/v1/course-distribution/doctors', [
            'full_name_ar' => 'د. طبيب جديد',
            'email' => 'doctor@example.com',
            'password' => 'Strong!Pass123',
            'primary_site_id' => $site->id,
            'specialty' => 'باطني',
        ])->assertCreated();

        $account = User::where('email', 'doctor@example.com')->firstOrFail();
        $this->assertTrue($account->hasRole('CLINICAL_SUPERVISOR'));
        $this->assertDatabaseHas('people', ['user_id' => $account->id, 'primary_site_id' => $site->id]);
    }

    public function test_supervisor_accounts_without_people_profiles_are_listed_and_can_be_assigned(): void
    {
        $account = User::factory()->create(['name' => 'د. موجود مسبقاً', 'email' => 'existing-doctor@example.com']);
        $account->roles()->attach(Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail());
        $site = TrainingSite::factory()->create(['is_active' => true]);

        $this->actingAs($this->user)->getJson('/api/v1/course-distribution/options')
            ->assertOk()
            ->assertJsonFragment(['user_id' => $account->id, 'full_name_ar' => 'د. موجود مسبقاً'])
            ->assertJsonPath('data.unassigned_doctors.0.user_id', $account->id);

        $this->actingAs($this->user)->putJson("/api/v1/course-distribution/doctors/{$account->id}/hospital", [
            'primary_site_id' => $site->id,
        ])->assertOk();

        $this->assertDatabaseHas('people', [
            'user_id' => $account->id,
            'email' => 'existing-doctor@example.com',
            'primary_site_id' => $site->id,
        ]);
        $this->actingAs($this->user)->getJson('/api/v1/course-distribution/options')
            ->assertJsonFragment(['user_id' => $account->id, 'primary_site_id' => $site->id]);
    }

    public function test_can_add_edit_and_delete_a_vacancy_row(): void
    {
        $created = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'course_id' => $this->course->id,
            'start_date' => '2026-09-01',
            'weeks_count' => 2,
        ])->assertCreated();
        $versionId = $created->json('data.version.id');

        $rowId = $this->actingAs($this->user)->postJson("/api/v1/course-distribution/versions/{$versionId}/rows", [
            'row_type' => 'vacancy',
            'training_site_id' => $this->doctor->primary_site_id,
            'label' => 'شاغر جراحة',
        ])->assertCreated()->assertJsonPath('data.person_id', null)->json('data.id');

        $blockId = $this->actingAs($this->user)->getJson('/api/v1/course-distribution/schedule?academic_year_id='.$this->year->id.'&academic_level=fourth&course_id='.$this->course->id)
            ->assertOk()->json('data.blocks.0.id');
        $this->actingAs($this->user)->putJson("/api/v1/course-distribution/versions/{$versionId}/cell", [
            'rotation_block_id' => $blockId,
            'course_schedule_row_id' => $rowId,
            'subgroup_id' => $this->subgroup->id,
        ])->assertOk();
        $this->assertDatabaseHas('student_clinical_assignments', [
            'course_schedule_row_id' => $rowId,
            'supervisor_id' => null,
        ]);

        $this->actingAs($this->user)->putJson("/api/v1/course-distribution/versions/{$versionId}/rows/{$rowId}", [
            'row_type' => 'doctor',
            'person_id' => $this->doctor->id,
            'training_site_id' => $this->doctor->primary_site_id,
        ])->assertOk()->assertJsonPath('data.person_id', $this->doctor->id);
        $this->assertDatabaseMissing('student_clinical_assignments', [
            'course_schedule_row_id' => $rowId,
            'supervisor_id' => null,
        ]);

        $this->actingAs($this->user)->deleteJson("/api/v1/course-distribution/versions/{$versionId}/rows/{$rowId}")
            ->assertOk();
        $this->assertDatabaseMissing('course_schedule_rows', ['id' => $rowId]);
    }

    public function test_published_schedule_can_be_revised_unpublished_and_deleted(): void
    {
        $created = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'course_id' => $this->course->id,
            'start_date' => '2026-09-01',
            'weeks_count' => 2,
        ])->assertCreated();
        $version = DistributionVersion::findOrFail($created->json('data.version.id'));
        $rowId = $this->actingAs($this->user)->postJson("/api/v1/course-distribution/versions/{$version->id}/rows", [
            'row_type' => 'doctor',
            'person_id' => $this->doctor->id,
            'training_site_id' => $this->doctor->primary_site_id,
        ])->assertCreated()->json('data.id');
        $blockId = $version->rotation->blocks()->firstOrFail()->id;
        $this->actingAs($this->user)->putJson("/api/v1/course-distribution/versions/{$version->id}/cell", [
            'rotation_block_id' => $blockId,
            'course_schedule_row_id' => $rowId,
            'subgroup_id' => $this->subgroup->id,
        ])->assertOk();
        $version->update(['status' => 'published', 'is_current' => true]);

        $duplicateCurrent = DistributionVersion::create([
            'rotation_id' => $version->rotation_id,
            'name' => 'نسخة منشورة قديمة مكررة',
            'status' => 'published',
            'is_current' => true,
        ]);

        $revisionId = $this->actingAs($this->user)->postJson("/api/v1/course-distribution/versions/{$version->id}/revise")
            ->assertOk()->assertJsonPath('data.source_version_id', $version->id)->json('data.id');
        $this->assertDatabaseHas('distribution_versions', ['id' => $revisionId, 'status' => 'manual']);
        $this->assertSame(1, CourseScheduleRow::where('distribution_version_id', $revisionId)->count());
        $this->assertSame(2, StudentClinicalAssignment::where('distribution_version_id', $revisionId)->count());
        $this->assertSame(1, CourseScheduleCell::where('distribution_version_id', $revisionId)->count());

        $scoredAssignment = StudentClinicalAssignment::where('distribution_version_id', $version->id)->firstOrFail();
        $mark = \App\Models\ClinicalAssessment::create([
            'student_id' => $scoredAssignment->student_id,
            'evaluator_person_id' => $this->doctor->id,
            'student_clinical_assignment_id' => $scoredAssignment->id,
            'assessment_kind' => 'weekly', 'evaluation_week' => 1,
            'score' => 8, 'max_score' => 10, 'status' => 'submitted',
        ]);
        $this->actingAs($this->user)->postJson("/api/v1/course-distribution/versions/{$version->id}/unpublish", [
            'reason' => 'محاولة إلغاء مع وجود علامات',
        ])->assertUnprocessable()->assertJsonValidationErrors('version');
        $this->assertTrue($version->fresh()->is_current);
        $mark->delete();

        $this->actingAs($this->user)->postJson("/api/v1/course-distribution/versions/{$version->id}/unpublish", [
            'reason' => 'جدول تجريبي للفحص',
        ])->assertOk()->assertJsonPath('data.status', 'withdrawn');

        $this->assertDatabaseHas('distribution_versions', ['id' => $duplicateCurrent->id, 'status' => 'withdrawn', 'is_current' => false]);

        $rotationId = $version->rotation_id;
        $historicalMark = \App\Models\ClinicalAssessment::create([
            'student_id' => $scoredAssignment->student_id,
            'evaluator_person_id' => $this->doctor->id,
            'student_clinical_assignment_id' => $scoredAssignment->id,
            'assessment_kind' => 'weekly', 'evaluation_week' => 1,
            'score' => 7, 'max_score' => 10, 'status' => 'submitted',
        ]);
        $this->actingAs($this->user)->deleteJson("/api/v1/course-distribution/rotations/{$rotationId}", [
            'reason' => 'محاولة حذف سجلات علامات',
        ])->assertUnprocessable()->assertJsonValidationErrors('rotation');
        $historicalMark->delete();
        $this->actingAs($this->user)->deleteJson("/api/v1/course-distribution/rotations/{$rotationId}", [
            'reason' => 'حذف الجدول التجريبي',
        ])->assertOk();
        $this->assertDatabaseMissing('rotations', ['id' => $rotationId]);
        $this->assertDatabaseMissing('distribution_versions', ['id' => $revisionId]);
    }

    public function test_breaks_shift_later_week_dates_and_remain_versioned(): void
    {
        $created = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'course_id' => $this->course->id,
            'schedule_scope' => 'annual',
            'start_date' => '2027-01-01',
            'weeks_count' => 3,
        ])->assertCreated();
        $version = DistributionVersion::findOrFail($created->json('data.version.id'));

        $breakId = $this->actingAs($this->user)->postJson("/api/v1/course-distribution/versions/{$version->id}/breaks", [
            'label' => 'عطلة منتصف الفترة',
            'start_date' => '2027-01-08',
            'end_date' => '2027-01-14',
        ])->assertCreated()->json('data.id');

        $this->actingAs($this->user)->getJson('/api/v1/course-distribution/schedule?academic_year_id='.$this->year->id.'&academic_level=fourth&course_id='.$this->course->id.'&schedule_scope=annual')
            ->assertOk()
            ->assertJsonPath('data.breaks.0.id', $breakId)
            ->assertJsonPath('data.blocks.0.start_date', '2027-01-01')
            ->assertJsonPath('data.blocks.1.start_date', '2027-01-15')
            ->assertJsonPath('data.blocks.2.start_date', '2027-01-22')
            ->assertJsonPath('data.rotation.effective_end_date', '2027-01-28');

        $version->update(['status' => 'published', 'is_current' => true]);
        $this->actingAs($this->user)->putJson("/api/v1/course-distribution/versions/{$version->id}/breaks/{$breakId}", [
            'label' => 'تعديل غير مسموح',
            'start_date' => '2027-01-08',
            'end_date' => '2027-01-14',
        ])->assertUnprocessable()->assertJsonValidationErrors('version');

        $revisionId = $this->actingAs($this->user)->postJson("/api/v1/course-distribution/versions/{$version->id}/revise")
            ->assertOk()->json('data.id');
        $this->assertDatabaseHas('distribution_version_breaks', [
            'distribution_version_id' => $revisionId,
            'label' => 'عطلة منتصف الفترة',
        ]);
    }
}

<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\DistributionVersion;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\TrainingSite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportCenterWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $reporter;
    private AcademicYear $year;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class]);

        $role = Role::create(['code' => 'REPORTER_TEST', 'name_key' => 'reporter', 'name_ar' => 'تقارير', 'name_en' => 'Reporter']);
        $permissionIds = Permission::whereIn('code', ['reports.view', 'reports.export'])->pluck('id');
        $role->permissions()->sync($permissionIds->mapWithKeys(fn (int $id) => [$id => ['scope_type' => 'global']])->all());
        $this->reporter = User::factory()->create();
        $this->reporter->roles()->attach($role);
        $this->year = AcademicYear::factory()->create(['is_current' => true]);

        Student::factory()->create([
            'university_number' => '22210466',
            'full_name_ar' => 'طالب تجريبي',
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'academic_registration_status' => 'registered',
        ]);
    }

    public function test_report_center_exposes_metrics_catalog_and_preview(): void
    {
        $this->actingAs($this->reporter)->getJson("/api/v1/report-center/summary?academic_year_id={$this->year->id}&academic_level=fourth")
            ->assertOk()
            ->assertJsonPath('data.metrics.students', 1)
            ->assertJsonPath('data.metrics.academically_registered', 1)
            ->assertJsonFragment(['key' => 'data_gaps']);

        $this->actingAs($this->reporter)->getJson("/api/v1/report-center/student_directory/preview?academic_year_id={$this->year->id}")
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.rows.0.0', '22210466')
            ->assertJsonPath('data.rows.0.1', 'طالب تجريبي');
    }

    public function test_report_center_exports_branded_excel_and_pdf(): void
    {
        $xlsx = $this->actingAs($this->reporter)->get("/api/v1/report-center/student_directory/export?format=xlsx&academic_year_id={$this->year->id}");
        $xlsx->assertOk();
        $this->assertStringContainsString('spreadsheetml', (string) $xlsx->headers->get('content-type'));
        $this->assertGreaterThan(5000, strlen($xlsx->streamedContent()));

        $pdf = $this->actingAs($this->reporter)->get("/api/v1/report-center/student_directory/export?format=pdf&academic_year_id={$this->year->id}");
        $pdf->assertOk();
        $this->assertStringContainsString('application/pdf', (string) $pdf->headers->get('content-type'));
        $this->assertStringStartsWith('%PDF', $pdf->getContent());
    }

    public function test_every_report_can_be_previewed_safely(): void
    {
        $keys = [
            'student_directory', 'group_rosters', 'clinical_schedule', 'supervisors_hospitals',
            'clinical_training_sites_sep_nov_2026', 'grades', 'attendance', 'clinical_assessments',
            'course_reports', 'quality_plans', 'data_gaps',
        ];

        foreach ($keys as $key) {
            $this->actingAs($this->reporter)->getJson("/api/v1/report-center/{$key}/preview")
                ->assertOk()
                ->assertJsonStructure(['data' => ['columns', 'rows', 'total', 'definition']]);
        }
    }

    public function test_monthly_training_site_report_counts_each_student_once_per_site_and_month(): void
    {
        $siteA = TrainingSite::factory()->create(['name_ar' => 'مستشفى أ']);
        $siteB = TrainingSite::factory()->create(['name_ar' => 'مركز ب']);
        $students = Student::factory()->count(3)->create([
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
        ]);
        $rotation = Rotation::factory()->create([
            'academic_year_id' => $this->year->id,
            'start_date' => '2026-09-01',
            'end_date' => '2026-11-30',
            'duration_weeks' => 13,
            'status' => 'active',
        ]);
        $version = DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'version_number' => 1,
            'status' => 'published',
            'is_current' => true,
        ]);
        $blocks = collect([
            RotationBlock::factory()->create(['rotation_id' => $rotation->id, 'from_week' => 1, 'to_week' => 5]),
            RotationBlock::factory()->create(['rotation_id' => $rotation->id, 'from_week' => 2, 'to_week' => 3]),
            RotationBlock::factory()->create(['rotation_id' => $rotation->id, 'from_week' => 5, 'to_week' => 9]),
            RotationBlock::factory()->create(['rotation_id' => $rotation->id, 'from_week' => 10, 'to_week' => 13]),
        ]);

        foreach ([[0, 0, $siteA], [0, 1, $siteA], [1, 2, $siteA], [2, 3, $siteB]] as [$studentIndex, $blockIndex, $site]) {
            StudentClinicalAssignment::create([
                'distribution_version_id' => $version->id,
                'student_id' => $students[$studentIndex]->id,
                'rotation_block_id' => $blocks[$blockIndex]->id,
                'training_site_id' => $site->id,
            ]);
        }

        $response = $this->actingAs($this->reporter)
            ->getJson('/api/v1/report-center/clinical_training_sites_sep_nov_2026/preview');

        $response->assertOk()
            ->assertJsonPath('data.columns', ['اسم المستشفى أو المركز الصحي', 'سبتمبر 2026', 'أكتوبر 2026', 'نوفمبر 2026', 'الإجمالي']);

        $rows = collect($response->json('data.rows'))->keyBy(0);
        $this->assertSame(['مستشفى أ', 2, 2, 1, 5], $rows->get('مستشفى أ'));
        $this->assertSame(['مركز ب', 0, 0, 1, 1], $rows->get('مركز ب'));

        $export = $this->actingAs($this->reporter)
            ->get('/api/v1/report-center/clinical_training_sites_sep_nov_2026/export?format=xlsx');
        $export->assertOk();
        $this->assertStringContainsString('spreadsheetml', (string) $export->headers->get('content-type'));
    }

    public function test_export_requires_export_permission(): void
    {
        $viewOnlyRole = Role::create(['code' => 'REPORT_VIEW_ONLY', 'name_key' => 'view', 'name_ar' => 'عرض', 'name_en' => 'View']);
        $permission = Permission::where('code', 'reports.view')->firstOrFail();
        $viewOnlyRole->permissions()->attach($permission->id, ['scope_type' => 'global']);
        $viewer = User::factory()->create();
        $viewer->roles()->attach($viewOnlyRole);

        $this->actingAs($viewer)->getJson('/api/v1/report-center/student_directory/preview')->assertOk();
        $this->actingAs($viewer)->get('/api/v1/report-center/student_directory/export?format=pdf')->assertForbidden();
    }
}

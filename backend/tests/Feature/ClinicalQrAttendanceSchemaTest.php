<?php

namespace Tests\Feature;

use App\Models\ClinicalQrAttendanceSession;
use App\Models\RotationBlock;
use App\Models\TrainingSite;
use Tests\TestCase;

class ClinicalQrAttendanceSchemaTest extends TestCase
{
    use \Illuminate\Foundation\Testing\RefreshDatabase;

    public function test_qr_attendance_session_persists_an_active_session_guard_and_date(): void
    {
        $block = RotationBlock::factory()->create();
        $site = TrainingSite::factory()->create();
        $version = \App\Models\DistributionVersion::create(['rotation_id'=>$block->rotation_id,'name'=>'QR schema test','status'=>'published','is_current'=>true]);
        $student = \App\Models\Student::factory()->create(['academic_year_id'=>$block->rotation->academic_year_id,'academic_level'=>$block->rotation->academic_level]);
        $assignment = \App\Models\StudentClinicalAssignment::create(['distribution_version_id'=>$version->id,'student_id'=>$student->id,'rotation_block_id'=>$block->id,'training_site_id'=>$site->id]);

        $session = ClinicalQrAttendanceSession::create([
            'public_id' => (string) \Illuminate\Support\Str::uuid(),
            'assignment_key' => '1|'.$block->id.'|'.$site->id.'|1',
            'student_clinical_assignment_id' => $assignment->id,
            'rotation_block_id' => $block->id,
            'training_site_id' => $site->id,
            'session_date' => '2026-09-24',
            'state' => 'check_in_open',
            'active_guard' => 1,
        ]);

        $this->assertSame('2026-09-24', $session->session_date->toDateString());
        $this->assertSame('check_in_open', $session->state);
        $this->assertDatabaseHas('clinical_qr_attendance_sessions', ['id' => $session->id, 'active_guard' => 1]);
    }
}

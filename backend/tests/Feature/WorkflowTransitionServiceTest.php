<?php

namespace Tests\Feature;

use App\Models\Correspondence;
use App\Models\Course;
use App\Models\WorkflowTransitionLog;
use App\Services\WorkflowTransitionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class WorkflowTransitionServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_records_a_valid_transition(): void
    {
        $record = Correspondence::create(['reference_number' => 'WF-001', 'direction' => 'incoming', 'subject' => 'Workflow test', 'correspondence_date' => now()->toDateString(), 'status' => 'draft']);
        app(WorkflowTransitionService::class)->transition($record, 'submitted');
        $this->assertDatabaseHas('workflow_transition_logs', ['entity_id' => $record->id, 'from_state' => 'draft', 'to_state' => 'submitted']);
    }

    public function test_it_rejects_an_invalid_transition(): void
    {
        $record = Correspondence::create(['reference_number' => 'WF-002', 'direction' => 'incoming', 'subject' => 'Workflow test', 'correspondence_date' => now()->toDateString(), 'status' => 'draft']);
        $this->expectException(ValidationException::class);
        app(WorkflowTransitionService::class)->transition($record, 'approved');
    }

    public function test_it_audits_a_course_update(): void
    {
        $course = Course::create(['code' => 'AUD-1', 'name_ar' => 'مساق تدقيق', 'credit_hours' => 1, 'is_active' => true]);
        $course->update(['name_ar' => 'مساق تدقيق معدل']);
        $this->assertDatabaseHas('audit_logs', ['entity_id' => $course->id, 'action' => 'Course.updated']);
    }
}

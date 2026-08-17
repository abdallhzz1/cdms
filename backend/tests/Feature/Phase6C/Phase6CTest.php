<?php

namespace Tests\Feature\Phase6C;

use App\Events\DistributionPublishedEvent;
use App\Events\SupervisorReassignedEvent;
use App\Events\ApprovalRevokedEvent;
use App\Models\AuditLog;
use App\Models\DistributionVersion;
use App\Models\Person;
use App\Models\Rotation;
use App\Models\StudentClinicalAssignment;
use App\Models\User;
use App\Notifications\DistributionPublishedNotification;
use App\Notifications\SupervisorReassignedNotification;
use App\Notifications\ApprovalRevokedNotification;
use App\Services\Distribution\DistributionPublicationService;
use App\Services\Distribution\SupervisorReassignmentService;
use App\Services\Distribution\DistributionApprovalService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use App\Models\Permission;
use App\Models\Role;
use Tests\TestCase;

class Phase6CTest extends TestCase
{
    use RefreshDatabase;

    protected $adminRole;
    protected $user;

    protected function setUp(): void
    {
        parent::setUp();
        
        // Setup permissions
        $permissions = ['distribution.publish', 'distribution.approve', 'distribution.update', 'distribution.view'];
        $permissionIds = [];
        foreach ($permissions as $p) {
            $perm = Permission::firstOrCreate(['code' => $p], ['module' => 'test', 'action' => 'test']);
            $permissionIds[] = $perm->id;
        }

        $this->adminRole = Role::firstOrCreate(['code' => 'ADMIN'], ['name_key' => 'admin', 'description_key' => 'admin']);
        $syncData = []; foreach($permissionIds as $id) { $syncData[$id] = ['scope_type' => 'global']; } $this->adminRole->permissions()->sync($syncData);
        
        $this->user = User::factory()->create(['is_active' => true]);
        $this->user->roles()->attach($this->adminRole->id);
    }

    public function test_distribution_published_event_dispatched_after_commit()
    {
        Event::fake([DistributionPublishedEvent::class]);
        
        $rotation = Rotation::factory()->create();
        $version = DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'status' => 'suggested',
            'is_current' => false,
            'is_published' => false,
            'created_by' => User::factory()->create()->id,
        ]);
        
        // Create an approval audit log for fingerprint match simulation
        $approvalLog = AuditLog::create([
            'user_id' => $this->user->id,
            'action' => 'version.approved',
            'entity_type' => DistributionVersion::class,
            'entity_id' => $version->id,
            'distribution_version_id' => $version->id,
            'changes' => ['fingerprint' => 'test-hash']
        ]);
        
        $service = app(DistributionPublicationService::class);
        $assignment = StudentClinicalAssignment::create([
            'distribution_version_id' => $version->id,
            'student_id' => \App\Models\Student::factory()->create()->id,
            'rotation_block_id' => \App\Models\RotationBlock::factory()->create(['rotation_id' => $rotation->id])->id,
            'training_site_id' => \App\Models\TrainingSite::factory()->create()->id
        ]);
        
        $approvalService = app(DistributionApprovalService::class);
        $fingerprint = $approvalService->generateFingerprint([$assignment->toArray()]);
        
        $approvalLog->update(['changes' => ['fingerprint' => $fingerprint]]);
        
        $this->mock(\App\Services\Distribution\DistributionStateValidator::class, function ($mock) {
            $mock->shouldReceive('validateState')->andReturn(true);
        });

        $this->actingAs($this->user);
        $service = app(DistributionPublicationService::class);
        $service->publish($version, $this->user, $version->updated_at->toIso8601String());
        
        Event::assertDispatched(DistributionPublishedEvent::class, function ($event) use ($version) {
            return $event->distributionVersionId === $version->id &&
                   $event->publishedByUserId === $this->user->id;
        });
    }

    public function test_distribution_published_listener_queues_notifications()
    {
        Notification::fake();
        
        $event = new DistributionPublishedEvent(
            eventId: 'test-uuid-1',
            distributionVersionId: 1,
            rotationId: 1,
            publishedByUserId: $this->user->id,
            supersededVersionIds: [],
            approvalAuditId: 1,
            isOverride: false,
            overrideReason: null,
            timestamp: now()->toIso8601String()
        );

        $listener = new \App\Listeners\SendDistributionPublishedNotification();
        $listener->handle($event);

        Notification::assertSentTo(
            $this->user,
            DistributionPublishedNotification::class,
            function ($notification, $channels) use ($event) {
                $data = $notification->toArray($this->user);
                return $data['event_id'] === $event->eventId &&
                       $data['distribution_version_id'] === 1 &&
                       in_array('database', $channels);
            }
        );
    }

    public function test_supervisor_reassigned_event_dispatched_after_commit()
    {
        Event::fake([SupervisorReassignedEvent::class]);

        $rotation = Rotation::factory()->create();
        $version = DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'status' => 'published',
            'is_current' => true,
            'is_published' => true,
            'created_by' => User::factory()->create()->id,
        ]);
        $oldSupervisor = Person::factory()->create();
        $newSupervisor = Person::factory()->create();

        $assignment = StudentClinicalAssignment::create([
            'distribution_version_id' => $version->id,
            'supervisor_id' => $oldSupervisor->id,
            'student_id' => \App\Models\Student::factory()->create()->id,
            'rotation_block_id' => \App\Models\RotationBlock::factory()->create(['rotation_id' => $rotation->id])->id,
            'training_site_id' => \App\Models\TrainingSite::factory()->create()->id
        ]);

        $service = app(SupervisorReassignmentService::class);
        $service->reassign($version, $assignment, $newSupervisor->id, $this->user);

        Event::assertDispatched(SupervisorReassignedEvent::class, function ($event) use ($assignment, $oldSupervisor, $newSupervisor) {
            return $event->assignmentId === $assignment->id &&
                   $event->previousSupervisorId === $oldSupervisor->id &&
                   $event->newSupervisorId === $newSupervisor->id;
        });
    }

    public function test_supervisor_reassigned_listener_resolves_recipients_and_notifies()
    {
        Notification::fake();

        $oldUser = User::factory()->create(['is_active' => true]);
        $oldSupervisor = Person::factory()->create(['user_id' => $oldUser->id]);

        $newUser = User::factory()->create(['is_active' => true]);
        $newSupervisor = Person::factory()->create(['user_id' => $newUser->id]);

        $event = new SupervisorReassignedEvent(
            eventId: 'test-uuid-2',
            assignmentId: 1,
            distributionVersionId: 1,
            rotationId: 1,
            studentId: 1,
            previousSupervisorId: $oldSupervisor->id,
            newSupervisorId: $newSupervisor->id,
            performedByUserId: $this->user->id,
            timestamp: now()->toIso8601String()
        );

        $listener = new \App\Listeners\SendSupervisorReassignedNotification();
        $listener->handle($event);

        Notification::assertSentTo([$oldUser, $newUser, $this->user], SupervisorReassignedNotification::class);
    }

    public function test_approval_revoked_event_dispatched_on_invalidation()
    {
        Event::fake([ApprovalRevokedEvent::class]);

        $rotation = Rotation::factory()->create();
        $version = DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'status' => 'published',
            'is_current' => true,
            'is_published' => true,
            'created_by' => User::factory()->create()->id,
        ]);
        AuditLog::create([
            'user_id' => $this->user->id,
            'action' => 'version.approved',
            'entity_type' => DistributionVersion::class,
            'entity_id' => $version->id,
            'distribution_version_id' => $version->id,
            'changes' => ['fingerprint' => 'hash']
        ]);

        $service = app(DistributionApprovalService::class);
        $service->invalidateApproval($version, $this->user);

        Event::assertDispatched(ApprovalRevokedEvent::class, function ($event) use ($version) {
            return $event->distributionVersionId === $version->id &&
                   $event->revokedByUserId === $this->user->id;
        });
    }

    public function test_listener_idempotency_prevents_duplicate_notifications()
    {
        // Actually save a notification to the database to test idempotency
        $eventId = 'test-uuid-idem';
        
        // Send first time
        $event = new ApprovalRevokedEvent(
            eventId: $eventId,
            distributionVersionId: 1,
            rotationId: 1,
            revokedByUserId: $this->user->id,
            reason: 'Test',
            timestamp: now()->toIso8601String()
        );

        $listener = new \App\Listeners\SendApprovalRevokedNotification();
        
        // Act: handle event once
        $listener->handle($event);
        
        $initialCount = $this->user->notifications()->count();
        $this->assertEquals(1, $initialCount);

        // Act: handle same event again
        $listener->handle($event);

        $finalCount = $this->user->notifications()->count();
        $this->assertEquals(1, $finalCount, "Idempotency failed: duplicate notification was created.");
    }

    public function test_inactive_users_do_not_receive_notifications()
    {
        Notification::fake();
        
        $inactiveUser = User::factory()->create(['is_active' => false]);
        $inactiveUser->roles()->attach($this->adminRole->id);

        
        $event = new ApprovalRevokedEvent(
            eventId: 'test-uuid-3',
            distributionVersionId: 1,
            rotationId: 1,
            revokedByUserId: $this->user->id,
            reason: 'Test',
            timestamp: now()->toIso8601String()
        );

        $listener = new \App\Listeners\SendApprovalRevokedNotification();
        $listener->handle($event);

        Notification::assertNotSentTo([$inactiveUser], ApprovalRevokedNotification::class);
    }
}

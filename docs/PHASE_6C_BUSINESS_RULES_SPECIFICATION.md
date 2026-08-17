# PHASE 6C — BUSINESS RULES SPECIFICATION
## Event & Notification Architecture

### 1. Executive Summary
Phase 6C specifies the event-driven decoupling and notification system for the Clinical Distribution Management System (CDMS). The architecture introduces domain events for critical clinical distribution lifecycle milestones—such as publication, supervisor reassignment, and approval revocation—without altering existing core domain business rules, backtracking algorithms, or placement immutability contracts.

Notifications are processed asynchronously via queued listeners, ensuring that notification delivery failures never degrade or roll back core clinical operational transactions.

---

### 2. Scope
The specification defines:
1. **Domain Event Catalog:** Detailed specifications for `DistributionPublishedEvent`, `SupervisorReassignedEvent`, `ApprovalRevokedEvent`, and additional recommended lifecycle events.
2. **Transaction & `afterCommit` Safety:** Guaranteeing events are dispatched only after database transactions commit.
3. **Queue Architecture:** Leveraging existing Phase 6A database queue infrastructure (`jobs`, `job_batches`, `failed_jobs`).
4. **Notification Architecture:** In-app and database notifications targeting authorized users and supervisors while respecting user privacy and RBAC.
5. **AuditLog Synergy:** Preserving `AuditLog` as the primary synchronous record while driving asynchronous side-effects via domain events.
6. **Testing & Observability:** Comprehensive test cases and structured logging guidelines.

---

### 3. Existing Architecture Audit

#### Codebase Inspection Findings
*   **Models:** `DistributionVersion.php`, `StudentClinicalAssignment.php`, `Rotation.php`, `RotationBlock.php`, `Student.php`, `Person.php`, `User.php`, `Department.php`, `TrainingSite.php`, `AuditLog.php`.
*   **Services:** `DistributionPublicationService.php`, `SupervisorReassignmentService.php`, `DistributionApprovalService.php`, `DistributionManualAssignmentService.php`, `CurrentDistributionResolver.php`.
*   **Authentication & RBAC:** Sanctum cookie/session stateful authentication; 53 granular permissions (`distribution.view`, `distribution.publish`, `distribution.approve`, `distribution.update`, `distribution.override`).
*   **Infrastructure Status:**
    *   `app/Events`, `app/Listeners`, `app/Notifications` directories: **Not yet created** (Clean slate for Phase 6C).
    *   `config/queue.php`: Configured with `database` driver fallback (`QUEUE_CONNECTION=database` enabled in Phase 6A).
    *   `jobs`, `job_batches`, `failed_jobs` tables: **Already migrated** (`2026_08_15_600001_create_jobs_table.php`).
    *   `config/mail.php` & `config/broadcasting.php`: **Unconfigured / Missing** (Mail and WebSockets are not enabled in baseline).
    *   `Student` model: **No User account association** (Students do not log in; notifications target authorized staff/supervisors only).

---

### 4. Current Event/Queue Infrastructure

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          CDMS Application Baseline                              │
├──────────────────────────────────┬──────────────────────────────────────────────┤
│ Infrastructure Component          │ Implementation Status                        │
├──────────────────────────────────┼──────────────────────────────────────────────┤
│ Queue Driver                     │ `database` driver (`jobs` table active)      │
│ Mail Transport                   │ None (`config/mail.php` missing)             │
│ Broadcast Driver                 │ None (`config/broadcasting.php` missing)     │
│ Database Notifications Table     │ Not yet migrated (Target for Phase 6C)      │
│ AuditLog Engine                  │ Synchronous DB writes inside transactions     │
└──────────────────────────────────┴──────────────────────────────────────────────┘
```

---

### 5. Domain Event Catalog

The CDMS event catalog defines lightweight, immutable, serializable events referencing entity IDs rather than mutable model instances.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             Domain Event Catalog                                 │
├───────────────────────────────┬──────────────────────────────┬───────────────────┤
│ Event Name                    │ Primary Trigger Service      │ Execution Mode    │
├───────────────────────────────┼──────────────────────────────┼───────────────────┤
│ DistributionPublishedEvent    │ DistributionPublicationSvc   │ Queued (afterCommit)
│ SupervisorReassignedEvent     │ SupervisorReassignmentSvc    │ Queued (afterCommit)
│ ApprovalRevokedEvent          │ DistributionApprovalSvc      │ Queued (afterCommit)
│ DistributionApprovedEvent     │ DistributionApprovalSvc      │ Queued (afterCommit)
│ DistributionSupersededEvent   │ DistributionPublicationSvc   │ Queued (afterCommit)
│ OverrideUsedEvent             │ Publication/Approval Services│ Synchronous/Audit │
└───────────────────────────────┴──────────────────────────────┴───────────────────┘
```

---

### 6. DistributionPublishedEvent Specification

#### Trigger
Dispatched when `DistributionPublicationService::publish()` completes successfully, setting `status = 'published'` and `is_current = true`.

#### Event Payload
```php
namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class DistributionPublishedEvent
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly string $eventId,
        public readonly int $distributionVersionId,
        public readonly int $rotationId,
        public readonly int $publishedByUserId,
        public readonly array $supersededVersionIds,
        public readonly int $approvalAuditId,
        public readonly bool $isOverride,
        public readonly ?string $overrideReason,
        public readonly string $timestamp
    ) {}
}
```

#### Transaction Safety
MUST be dispatched with `$shouldDispatchAfterCommit = true` or `dispatch()->afterCommit()` to ensure listeners execute only after DB transaction commit.

---

### 7. SupervisorReassignedEvent Specification

#### Trigger
Dispatched when `SupervisorReassignmentService::reassign()` modifies `supervisor_id` on a published assignment.

#### Event Payload
```php
namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class SupervisorReassignedEvent
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly string $eventId,
        public readonly int $assignmentId,
        public readonly int $distributionVersionId,
        public readonly int $rotationId,
        public readonly int $studentId,
        public readonly ?int $previousSupervisorId,
        public readonly ?int $newSupervisorId,
        public readonly int $performedByUserId,
        public readonly string $timestamp
    ) {}
}
```

---

### 8. ApprovalRevokedEvent Specification

#### Trigger
Dispatched when `DistributionApprovalService::invalidateApproval()` marks an existing approval invalid due to manual assignment mutation or explicit revocation.

#### Event Payload
```php
namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ApprovalRevokedEvent
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly string $eventId,
        public readonly int $distributionVersionId,
        public readonly int $rotationId,
        public readonly int $revokedByUserId,
        public readonly string $reason,
        public readonly string $timestamp
    ) {}
}
```

---

### 9. Additional Recommended Events

1.  **`DistributionApprovedEvent`:** Dispatched when a version passes fingerprint validation and is approved (`action = 'version.approved'`).
2.  **`DistributionSupersededEvent`:** Dispatched for previous published versions when a new version is published for the same rotation.
3.  **`OverrideUsedEvent`:** Dispatched whenever an administrative override is exercised (e.g. publishing with unassigned students).

---

### 10. Notification Strategy

#### Recipient Resolution & RBAC
*   **Department Administrators & Directors:** Identified via `User` accounts holding `distribution.publish` or `distribution.approve` permissions, or linked `Person` records in the department.
*   **Clinical Supervisors:** Identified via `Person` records (`user_id` relation) assigned to the clinical placement.
*   **Students:** Students do NOT have system `User` accounts and CANNOT receive system notifications (schedules are exported or viewed via public endpoints).

#### Channels
Primary channel for Phase 6C is **Database Notifications** (`Illuminate\Notifications\Notification` stored in `notifications` table). External email/SMS channels are deferred until mail infrastructure is added.

---

### 11. Queue Architecture

*   **Connection:** `database` queue driver (`QUEUE_CONNECTION=database`).
*   **Listeners:** Implement `Illuminate\Contracts\Queue\ShouldQueue`.
*   **Retry & Backoff:** `$tries = 3`, `$backoff = [10, 30, 60]`.
*   **Failure Isolation:** Notification delivery failures log to `failed_jobs` table and MUST NEVER roll back domain operations.

---

### 12. Transaction & `afterCommit` Strategy

```
[ DB Transaction Start ]
    │
    ├── Update DistributionVersion (status = 'published', is_current = true)
    ├── Create AuditLog (action = 'version.published')
    └── Event::dispatch(new DistributionPublishedEvent(...))->afterCommit()
    │
[ DB Transaction Commit ] ──► Queue Worker picks up queued listeners
```

Listeners process asynchronously ONLY after DB commit succeeds.

---

### 13. AuditLog Integration

*   **`AuditLog` is Authoritative:** Synchronously written inside database transactions.
*   **Domain Events drive Side Effects:** Asynchronously triggered after transaction commit.
*   **Zero Duplicate Logs:** Listeners MUST NOT re-create `AuditLog` records created during the primary transaction.

---

### 14. Idempotency Strategy

Listeners check `eventId` (UUID) or audit log correlation before performing actions. If a notification for `$eventId` has already been recorded in `notifications` data, execution is skipped safely.

---

### 15. Security & RBAC

*   Event dispatching services check permissions (`permission:distribution.publish`, `permission:distribution.update`) before dispatching.
*   Notification payload content is sanitized and contains no sensitive credentials or raw tokens.

---

### 16. Performance Requirements

*   Zero impact on primary HTTP request latency (notification processing offloaded to queue).
*   Maximum event payload size $< 2 \text{ KB}$.

---

### 17. Failure & Recovery Model

*   If queue worker is down, jobs accumulate safely in `jobs` table.
*   Failed listener jobs move to `failed_jobs` after 3 retries.
*   Clinical operations remain $100\%$ operational during queue outages.

---

### 18. Observability

Structured log events logged to standard log channels:
```json
{
  "event": "DistributionPublishedEvent",
  "event_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "distribution_version_id": 12,
  "status": "dispatched",
  "timestamp": "2026-08-15T18:42:00Z"
}
```

---

### 19. Frontend Impact

Phase 6C requires **NO FRONTEND SPA CHANGES**. In-app notification center UI is deferred to future operational phases.

---

### 20. Database Impact

```
DATABASE MIGRATION REQUIRED: 1 Migration
```
*   `2026_08_15_700001_create_notifications_table.php`: Standard Laravel notifications table (`id`, `type`, `notifiable_type`, `notifiable_id`, `data`, `read_at`, `created_at`, `updated_at`).

---

### 21. Testing Strategy

Backend test suite (`tests/Feature/Phase6C/Phase6CTest.php`):
1. `Event::fake()` verifies `DistributionPublishedEvent` dispatched on publish.
2. Event NOT dispatched when transaction rolls back.
3. `SupervisorReassignedEvent` payload correctness.
4. `ApprovalRevokedEvent` payload correctness.
5. Queued listener handles missing recipient gracefully.
6. Notification delivery failure does not roll back reassignment.
7. Listener idempotency on duplicate processing.

---

### 22. Definition of Done

Phase 6C will be ready for completion when:
1. `DistributionPublishedEvent`, `SupervisorReassignedEvent`, `ApprovalRevokedEvent` implemented.
2. Transaction `afterCommit` safety verified.
3. Database notification table migrated and tested.
4. Queued listeners execute asynchronously without blocking HTTP requests.
5. Notification failures isolated from clinical transactions.
6. Full backend regression suite ($213+$ tests) remains green.
7. Full frontend test suite ($34+$ tests) remains green.
8. TypeScript check has 0 errors.

---

### 23. Implementation Sequence

```
Phase 6C-1: Database Notification Migration (create_notifications_table.php)
     │
     ▼
Phase 6C-2: Domain Events Definition (Events/DistributionPublishedEvent.php, etc.)
     │
     ▼
Phase 6C-3: Service Instrumentation (DistributionPublicationService, SupervisorReassignmentService, DistributionApprovalService)
     │
     ▼
Phase 6C-4: Queued Listeners & Notifications (Listeners/SendDistributionPublishedNotification.php, Notifications/DistributionPublishedNotification.php)
     │
     ▼
Phase 6C-5: Automated Test Suite (Phase6CTest.php) & Full Regression
```

---

### 24. Risks & Mitigations

*   **Risk:** Listener dispatches before DB commit -> **Mitigation:** Use `afterCommit` event dispatching.
*   **Risk:** Student notification expectation -> **Mitigation:** Document clearly that students do not have `User` accounts.

---

### 25. Final Readiness Verdict

# PHASE 6C — READY FOR IMPLEMENTATION

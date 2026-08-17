# Phase 5 — Operational Distribution & Clinical Schedule
## Business Rules Specification

---

### 1. Executive Summary

This document specifies the business rules, domain architecture, security boundaries, API requirements, and operational flows for **Phase 5: Operational Distribution & Clinical Schedule** of the Clinical Distribution Management System (CDMS).

The primary objective of Phase 5 is to transition the Clinical Distribution Engine from generation, manual editing, approval, and publication (Phases 3B, 4A, 4B, 4C) to **operational consumption** by Clinical Department actors (administrators, department heads, training site coordinators, clinical supervisors, and medical students).

This document serves as the pre-implementation specification and architectural audit report. In accordance with project instructions, **no production code, database migrations, or schema changes are introduced in this phase**.

---

### 2. Existing System Baseline

The existing system baseline has been verified through a code and test audit:

- **Automated Distribution Engine (Phase 3B)**: Fully operational with constraint validation (`DistributionValidationService`), capacity rules, block conflict detection, and deterministic backtracking algorithm.
- **Manual Assignment Foundation (Phase 4A)**: Fully operational with $O(1)$ query state validation (`DistributionStateValidator`), controlled override workflow requiring explicit reasons and `distribution.override` permission, immutable placement rules for published versions, and complete `AuditLog` generation.
- **Approval, Publication & Version Comparison (Phase 4B)**: Fully operational with SHA256 approval fingerprinting, automatic approval invalidation upon assignment mutation, concurrency-protected transactional publication (`DistributionPublicationService`), version supersession auditing, and differential comparison (`DistributionVersionComparisonService`).
- **Distribution Workbench (Phase 4C)**: Full-stack React UI providing version list management, summary metrics, unassigned student views, constraint conflict views, version comparison views, and audit trail.
- **Verification Baseline**: **122 backend feature/unit tests** (351 assertions) and **13 frontend tests** passing with **0 failures and 0 errors**.

---

### 3. Phase 5 Objectives

1. Establish a single authoritative operational model for the **Current Published Distribution** across all rotations.
2. Provide role-specific operational views (Student Schedule, Supervisor View, Department View, Training Site View).
3. Provide operational supervisor management after publication without violating placement immutability.
4. Establish operational unassigned student handling and correction procedures.
5. Provide comprehensive operational reporting and export definitions.
6. Enforce strict role-based access control (RBAC) and data isolation.
7. Maintain $O(1)$ query scaling, zero $N+1$ query regressions, and full audit integrity.

---

### 4. Confirmed Existing Business Rules

The following rules are established from prior phases and MUST be preserved without alteration:

1. **Placement Immutability**: Published clinical placement assignments (`rotation_block_id`, `training_site_id`, `student_id`) are strictly immutable.
2. **Placement Correction Flow**: Correcting published placements requires creating a new distribution version and publishing it, which supersedes the previous published version.
3. **Supervisor Mutability**: `supervisor_id` on a published assignment MAY be updated post-publication by authorized staff (`distribution.update` / `distribution.publish`), because supervisor allocation is an operational staffing assignment rather than a student clinical placement.
4. **Approval Invalidation**: Any mutation to assignments in a version immediately invalidates any active approval for that version.
5. **Publication Approval Requirement**: A version MUST have a valid, active approval matching its current state fingerprint to be published.
6. **Hard Constraint Enforcement**: All state updates MUST be validated against hard constraints (capacity, compatibility, block bounds, subgroup integrity).
7. **Override Controls**: Overriding hard constraints or approving/publishing with unassigned students requires `force = true`, a non-empty `override_reason`, and `distribution.override` permission.
8. **Inactive Student Exclusion**: Inactive students (`registration_status != 'active'`) MUST NOT receive clinical assignments.
9. **Department Derivation**: `department_id` on assignments MUST be derived authoritatively from `RotationBlock.department_id`.
10. **Capacity Evaluation**: Site capacity MUST be evaluated as `TrainingSite + RotationBlock`.

---

### 5. Current Published Version Model

#### 5.1 Audit Discovery & Discrepancy Analysis
An audit of `DistributionPublicationService` and `DistributionVersionController` reveals:
- When a new version is published for a rotation, previous published versions retain `status = 'published'` in the database.
- Previous published versions receive an `AuditLog` entry with `action = 'version.superseded'` and `changes = ['superseded_by' => new_version_id]`.
- Current read APIs identify the operational version by calculating `MAX(id)` for `status = 'published'` per `rotation_id`.

#### 5.2 Evaluation of Current Published Version Options

- **OPTION A: Derived via `MAX(id)` or `MAX(published_at)` Subquery (Current State)**
  - *Pros*: Zero schema migration risk; 100% backward compatible with existing code and tests.
  - *Cons*: Querying "current published distribution" across multiple rotations requires subqueries or grouping.

- **OPTION B: Add `is_current` Boolean Column to `distribution_versions`**
  - *Pros*: Extremely fast index lookup (`WHERE rotation_id = ? AND is_current = 1`); clean Eloquent relationship (`hasOne(DistributionVersion::class)->where('is_current', true)`).
  - *Cons*: Requires a database migration; requires transactional update to set `is_current = false` on previous published versions.

- **OPTION C: Mutate `status` Enum on Superseded Versions from `published` to `superseded`**
  - *Pros*: Explicit enum status on row level.
  - *Cons*: Modifies historical row status; violates the principle that status `published` reflects the milestone at which the version was published.

#### 5.3 Formal Decision

DECISION:
Phase 5 will adopt **OPTION B (Explicit `is_current` Column)** as a recommended migration in Phase 5A execution, while maintaining full fallback compatibility with **OPTION A (Derived MAX(id))** in read queries if schema changes are deferred. A version is operationally "CURRENT PUBLISHED" if and only if it is the latest published version for its rotation with `is_current = true`. Exactly ONE version per rotation may have `is_current = true` at any time.

RATIONALE:
An explicit `is_current` column indexed with `(rotation_id, is_current)` provides optimal $O(1)$ query performance for high-frequency operational schedule views (Student Portal, Supervisor View, Department View, Training Site View) without needing aggregate subqueries on every schedule request.

IMPLEMENTATION IMPACT:
- Add `is_current` (boolean, default false, indexed) to `distribution_versions` table via a clean migration in Phase 5A.
- Update `DistributionPublicationService::publish()` inside the existing `DB::transaction()` to set `is_current = false` on all existing published versions for the rotation before setting `is_current = true` on the newly published version.
- Expose `is_current` in version API responses.

DEPENDENCIES:
- `DistributionVersion` model
- `DistributionPublicationService`

OPEN QUESTION:
None. The transactional flip ensures concurrency protection under existing `lockForUpdate()` logic.

---

### 6. Student Clinical Schedule Rules

#### 6.1 Domain Rules & Student Identity Discovery
Audit discovery: `Student` models represent data subjects managed by staff. Students do NOT currently have direct system `User` logins (`User` accounts belong to staff/faculty).

DECISION:
Operational Student Schedules will be exposed via two access mechanisms:
1. **Administrative Student Schedule View**: Authorized staff (`students.view` or `distribution.view`) can look up the complete clinical schedule for any student.
2. **Student Self-Service Schedule API**: Accessible via authenticated student endpoints (or tokenized student lookup using `university_number` / student credentials if student authentication is enabled in Phase 5B).

DECISION:
Student Schedules MUST display assignments exclusively from the **CURRENT PUBLISHED VERSION** of each rotation. Draft, suggested, manual, or superseded versions MUST NEVER be visible to students.

RATIONALE:
Students must only see official, finalized clinical placements to prevent confusion or attendance at non-finalized sites.

IMPLEMENTATION IMPACT:
- `GET /api/v1/students/{student}/clinical-schedule`: Returns all clinical assignments for the student across all active rotations for the current academic year from current published versions.
- If a student is unassigned in an active rotation, the schedule returns an explicit status `UNASSIGNED` for that rotation block, rather than silently omitting the block.

DEPENDENCIES:
- `StudentClinicalAssignment`
- `DistributionVersion`
- `Student`

OPEN QUESTION:
Will students log in directly via Sanctum User accounts in Phase 5B, or will schedules be queried via administrative/portal APIs? (Documented in Section 24).

---

### 7. Supervisor Management Rules

#### 7.1 Domain Discovery
`Person` model currently contains fields: `max_students`, `department_id`, `primary_site_id`, `is_active`, `user_id`.

DECISION:
1. **Post-Publication Supervisor Assignment**: Authorized staff (`distribution.update` or `distribution.publish`) MAY assign or reassign supervisors on published clinical assignments.
2. **Immutability Protection**: Post-publication supervisor edits MUST ONLY modify `supervisor_id`. Any attempt to modify `rotation_block_id`, `training_site_id`, or `student_id` on a published assignment MUST be rejected with HTTP 422.
3. **Supervisor Eligibility**: Assigned supervisors MUST be active staff records (`Person.is_active = true`).
4. **Audit Requirement**: Reassigning a supervisor on a published assignment MUST generate an `AuditLog` entry with `action = 'supervisor.reassigned'`, recording `old_supervisor_id` and `new_supervisor_id`.

RATIONALE:
Doctors and clinical supervisors frequently rotate or experience emergency schedule changes. Reassigning a supervisor does not alter the student's clinical site or block timing, so it should not require re-publishing the entire distribution.

IMPLEMENTATION IMPACT:
- `PUT /api/v1/distribution-versions/{version}/assignments/{assignment}/supervisor`: Dedicated post-publication supervisor update endpoint.
- Validates supervisor `is_active = true`.
- Generates `AuditLog` entry.

DEPENDENCIES:
- `StudentClinicalAssignment`
- `Person`
- `AuditLog`

OPEN QUESTION:
Should supervisor workload exceed `Person.max_students` trigger a warning or hard constraint? (Specified in Section 24).

---

### 8. Department View Rules

DECISION:
Department Heads and Department Staff (`department_head`, `distribution.view`) can view an operational **Department Clinical Distribution View**.
- Department scope is strictly derived from `RotationBlock.department_id` (matching the Phase 3B/4A domain rule).
- Displays all students currently assigned to blocks belonging to the department within the current published versions.
- Includes training site, block dates/weeks, subgroup, and assigned supervisor.

RATIONALE:
Department Heads need full visibility over all students rotating through their specialty (e.g., Internal Medicine, Surgery) across all training hospitals.

IMPLEMENTATION IMPACT:
- `GET /api/v1/departments/{department}/clinical-distribution`: Returns current published assignments filtered by `department_id`.
- Supports filtering by rotation, block, site, and supervisor.

DEPENDENCIES:
- `Department`
- `RotationBlock`
- `StudentClinicalAssignment`

---

### 9. Training Site Rules

DECISION:
Training Site Coordinators and Administrators can view an operational **Training Site Distribution View**.
- Displays all students assigned to the training site across all blocks for current published versions.
- Displays **Capacity Utilization Metrics** evaluated as `SITE + ROTATION BLOCK`:
  - `max_students` (from `SiteCapacityRule`)
  - `assigned_students` count
  - `utilization_percentage` (`assigned / max * 100`)
- Highlights capacity over-utilization (if overrides were executed during manual distribution).

RATIONALE:
Hospitals and clinical sites require advance rosters of incoming medical students per rotation block to arrange orientation, badging, and clinical ward access.

IMPLEMENTATION IMPACT:
- `GET /api/v1/training-sites/{site}/clinical-distribution`: Returns current published assignments and block-level capacity utilization metrics.

DEPENDENCIES:
- `TrainingSite`
- `SiteCapacityRule`
- `StudentClinicalAssignment`

---

### 10. Supervisor View Rules

DECISION:
Clinical Supervisors (`CLINICAL_SUPERVISOR` role attached to `User` via `Person.user_id`) can view their **Assigned Students View**.
- Displays only students assigned to the logged-in supervisor (`supervisor_id == person.id`) in current published versions.
- Exposes student details: full name, university number, subgroup, rotation block, dates, training site, and department.
- Supervisors CANNOT view assignments of other supervisors unless granted broader administrative permissions (`distribution.view`).

RATIONALE:
Supervisors require quick, direct access to their assigned student cohorts for bedside teaching, logbook verification, and attendance without exposing unauthorized department-wide data.

IMPLEMENTATION IMPACT:
- `GET /api/v1/supervisor/my-students`: Resolves `User -> Person -> supervisor_id` and fetches assignments from current published versions.

DEPENDENCIES:
- `Person`
- `User`
- `StudentClinicalAssignment`

---

### 11. Unassigned Student Rules

DECISION:
1. **Unassigned Student Operational Status**: Active cohort students who lack an assignment in a current published version are designated as `OPERATIONALLY UNASSIGNED`.
2. **Visibility**: Administrators (`distribution.view`) can view a central **Unassigned Students Operational Report**. Unassigned students are NOT displayed as active on site/supervisor views.
3. **Correction Workflow**:
   - Placement corrections for unassigned students CANNOT be performed directly on a published version.
   - To place an unassigned student into a published rotation, an administrator MUST:
     1. Create a new draft/manual distribution version copied from or extending the current published version.
     2. Assign the student using the manual assignment service (`DistributionManualAssignmentService`).
     3. Approve and publish the new version via `DistributionPublicationService`.
     4. The new version becomes `is_current = true`, superseding the old version.

RATIONALE:
Preserves strict placement immutability for published distributions and maintains a complete audit trail for post-publication student additions.

IMPLEMENTATION IMPACT:
- Operational report endpoint: `GET /api/v1/distribution/unassigned-report`.
- Version cloning helper service to facilitate creating a new version from a published baseline.

DEPENDENCIES:
- `DistributionManualAssignmentService`
- `DistributionPublicationService`

---

### 12. Historical Version Rules

DECISION:
1. **Preservation**: Historical (superseded) published versions MUST be preserved indefinitely in the database. Deletion of published versions is strictly prohibited.
2. **Immutability**: Superseded versions are completely read-only. No assignments or supervisors may be edited on superseded versions.
3. **Auditability**: Historical versions remain accessible to administrators for audit, dispute resolution, and legal compliance.
4. **Comparison**: Historical versions can be compared against any other version of the same rotation using `DistributionVersionComparisonService`.

RATIONALE:
Medical faculties must retain immutable historical records of clinical placements for accreditation, student appeals, and licensing verification.

IMPLEMENTATION IMPACT:
- `DELETE /api/v1/distribution-versions/{version}` MUST reject requests for any version with `status = 'published'` or `is_superseded = true`.

DEPENDENCIES:
- `DistributionVersion`
- `DistributionVersionComparisonService`

---

### 13. Reporting Requirements

Phase 5 introduces 6 core operational reports:

| Report Name | Target Roles | Data Source | Key Columns / Metrics | Export Formats |
| :--- | :--- | :--- | :--- | :--- |
| **1. Master Clinical Schedule** | Admin, Dean, Director | Current Published Versions | Student ID, Name, Level, Rotation, Block, Site, Dept, Supervisor | Excel, PDF, CSV |
| **2. Student Individual Schedule** | Student, Advisor, Admin | Current Published Versions | Block Name, Dates, Site Name, Department, Supervisor Name | PDF, Excel |
| **3. Training Site Capacity & Roster**| Site Coordinator, Admin | Current Published Versions | Site, Block, Capacity, Assigned Count, Utilization %, Student List | Excel, PDF |
| **4. Department Roster** | Dept Head, Admin | Current Published Versions | Dept, Rotation, Block, Student List, Subgroup, Site, Supervisor | Excel, PDF |
| **5. Supervisor Student Roster** | Supervisor, Admin | Current Published Versions | Supervisor, Student Name, ID, Subgroup, Block, Site, Contact | Excel, PDF |
| **6. Unassigned Cohort Report** | Clinical Director, Admin | Current Published Versions | Student ID, Name, Level, Academic Year, Subgroup, Unassigned Reason | Excel, PDF |

RATIONALE:
Standardized operational reporting enables clinical departments and partner teaching hospitals to export verified rosters for daily clinical operations.

---

### 14. Audit Trail Requirements

Phase 5 requires logging the following operational events into `AuditLog`:

- `version.published`: Logged when a version is published.
- `version.superseded`: Logged when a published version is replaced by a newer version.
- `supervisor.reassigned`: Logged when a supervisor is updated on a published assignment.
- `schedule.exported`: Logged when an administrative master report or export is generated.

DECISION:
Standard `GET` read requests for viewing schedules will NOT create `AuditLog` rows to prevent log bloat, but sensitive report exports (`schedule.exported`) MUST generate audit records.

---

### 15. RBAC & Security Requirements

#### 15.1 Permission Mapping

| Operational Action | Required Permission | Allowed Roles (Default) |
| :--- | :--- | :--- |
| View Master Distribution List | `distribution.view` | SYS_ADMIN, DEAN, VICE_DEAN, CLINICAL_DIRECTOR, ADMIN_ASSISTANT, QUALITY |
| View Student Schedule (Admin) | `distribution.view` OR `students.view` | SYS_ADMIN, CLINICAL_DIRECTOR, ADMIN_ASSISTANT, ACADEMIC_ADVISOR |
| View Department Schedule | `distribution.view` | DEPARTMENT_HEAD, CLINICAL_DIRECTOR, ADMIN_ASSISTANT |
| View Site Roster | `distribution.view` | RTA, CLINICAL_DIRECTOR, ADMIN_ASSISTANT |
| View Assigned Students (Supervisor)| `distribution.view` | CLINICAL_SUPERVISOR, DEPARTMENT_HEAD |
| Reassign Supervisor Post-Publish | `distribution.update` | CLINICAL_DIRECTOR, ADMIN_ASSISTANT, DEPARTMENT_HEAD |
| Export Operational Reports | `reports.export` | SYS_ADMIN, DEAN, CLINICAL_DIRECTOR, QUALITY |

#### 15.2 Security & Data Isolation Controls
1. **Student Access Isolation**: If student login is enabled, students MUST ONLY access their own `student_id` schedule. Querying another student's schedule MUST return HTTP 403.
2. **Supervisor Access Isolation**: Clinical Supervisors MUST ONLY access assignments where `supervisor_id` matches their own `Person.id`.
3. **Cross-Rotation Tampering Prevention**: All endpoint route parameters MUST use scoped Eloquent bindings.

---

### 16. API Requirements

Phase 5 will introduce the following read-only and operational update endpoints:

#### 16.1 Current Distribution & Schedules
- `GET /api/v1/operational/current-distributions`: Returns list of current published versions per rotation.
- `GET /api/v1/operational/students/{student}/schedule`: Returns student's published schedule across active rotations.
- `GET /api/v1/operational/departments/{department}/distribution`: Returns department published schedule.
- `GET /api/v1/operational/training-sites/{site}/distribution`: Returns site published schedule and capacity utilization.
- `GET /api/v1/operational/supervisors/my-students`: Returns assigned students for the authenticated supervisor.

#### 16.2 Supervisor Management
- `PUT /api/v1/operational/assignments/{assignment}/supervisor`: Updates `supervisor_id` on a published assignment.

#### 16.3 Operational Reports & Exports
- `GET /api/v1/operational/reports/master-schedule`: Returns master schedule dataset with export options.
- `GET /api/v1/operational/reports/unassigned`: Returns unassigned student report.

All API responses MUST follow the standard CDMS envelope:
```json
{
    "success": true,
    "data": {},
    "message": "...",
    "meta": {}
}
```

---

### 17. Frontend Requirements

Phase 5 will introduce 4 dedicated operational views:

1. **Current Published Distribution View** (`/operational/current`):
   - Executive dashboard displaying all active rotations and their current published distribution.
2. **Student Schedule Portal View** (`/operational/my-schedule` or `/students/:id/schedule`):
   - Clear timeline card view showing rotation block dates, site names, departments, and supervisor contacts.
3. **Department & Site Operational Roster View** (`/operational/roster`):
   - Filterable view by department or training site with capacity utilization bars.
4. **Supervisor Portal View** (`/operational/supervisor`):
   - Clean list of assigned medical students for the logged-in doctor with contact info.

Design Standards:
- Calm, clean, light medical-administrative layout matching Phase 4C styling.
- Responsive data tables with print-friendly styling.

---

### 18. Performance Requirements

1. **Zero N+1 Queries**: All schedule and roster endpoints MUST eager-load relationships (`with(['student', 'rotationBlock', 'trainingSite', 'department', 'supervisor'])`).
2. **$O(1)$ Schedule Queries**: Student, supervisor, site, and department queries MUST execute in $O(1)$ query count relative to student cohort size.
3. **Database Indexing**: Ensure database indexes exist for:
   - `student_clinical_assignments(distribution_version_id, student_id)`
   - `student_clinical_assignments(distribution_version_id, training_site_id)`
   - `student_clinical_assignments(distribution_version_id, department_id)`
   - `student_clinical_assignments(distribution_version_id, supervisor_id)`
4. **Aggregated Summary Counts**: Roster summaries MUST use database aggregation (`COUNT()`, `GROUP BY`) rather than hydrating full collection sets.

---

### 19. Notifications Decision

DECISION:
Phase 5 will **DEFER automated email/SMS notifications** and focus strictly on **In-App Operational Readiness Alerts & Extension Points**.

RATIONALE:
Email and SMS notification infrastructure (queue drivers, mail templates, SMTP configuration) is an external integration concern that should not block core operational schedule consumption.

IMPLEMENTATION IMPACT:
- Create event hooks (`DistributionPublishedEvent`, `SupervisorReassignedEvent`) in Laravel so email/SMS notification listeners can be attached in a future phase without modifying core services.

---

### 20. Data Integrity Rules

1. **Foreign Key Protection**: Clinical assignments MUST NOT point to non-existent students, blocks, sites, or departments.
2. **Supervisor Active Status**: Assignments CANNOT be assigned to inactive `Person` records.
3. **Version Association**: An assignment MUST belong to exactly one `DistributionVersion`.
4. **Academic Year Matching**: All rotation blocks and student subgroup assignments in a distribution MUST belong to the rotation's `academic_year_id`.

---

### 21. Error & Edge Cases

| Case | Expected Behavior | HTTP Status |
| :--- | :--- | :--- |
| Student has no published assignment | Return schedule with explicit `UNASSIGNED` block status | 200 OK |
| Supervisor update attempted on invalid student assignment | Return error message | 404 Not Found |
| Non-supervisor edit attempted on published assignment | Reject placement modification | 422 Unprocessable |
| Supervisor reassigned to inactive Person | Reject with `supervisor_id` validation message | 422 Unprocessable |
| User requests schedule without permission | Reject unauthorized access | 403 Forbidden |
| Concurrency conflict on supervisor update | Require refresh | 422 Unprocessable |

---

### 22. Phase 5 Scope

Phase 5 **WILL INCLUDE**:
- Implementation of the `is_current` column migration and published version management.
- Operational read APIs for Student Schedule, Department Roster, Site Roster, and Supervisor View.
- Post-publication supervisor reassignment service and endpoint.
- Operational unassigned student report.
- Export definitions (Excel/PDF/CSV) for master and roster reports.
- Frontend operational views for schedules, rosters, and supervisor portal.
- Event hooks for future notifications.
- Comprehensive automated test suite for Phase 5.

---

### 23. Out of Scope

Phase 5 **WILL NOT INCLUDE**:
- Modifying the Phase 3B distribution algorithm or candidate generator.
- Modifying Phase 4A/4B/4C manual assignment or approval fingerprinting architecture.
- External SMTP email sending or SMS gateways.
- Student attendance tracking or clinical logbooks.
- Student grade submission or clinical assessment forms.
- Mobile application development.

---

### 24. Open Business Decisions

1. **Supervisor Max Student Workload**:
   - *Question*: Should assigning more students than `Person.max_students` trigger a hard blocking error or a soft warning during post-publication supervisor assignment?
   - *Recommendation*: Soft warning in Phase 5 to avoid blocking emergency staffing.

2. **Student Self-Service Authentication**:
   - *Question*: Will students log in using Sanctum `User` accounts in Phase 5B, or will student schedule lookup be tokenized?
   - *Recommendation*: Support staff lookup initially (`/students/{student}/schedule`), and add student portal auth mapping if student user accounts are seeded.

---

### 25. Recommended Implementation Sequence

We recommend executing Phase 5 in the following 6 sequential sub-phases:

- **Phase 5A**: Current Published Distribution Architecture & Core Operational Read APIs
- **Phase 5B**: Student Clinical Schedule Engine & Administrative Schedule View
- **Phase 5C**: Post-Publication Supervisor Management & Supervisor Portal View
- **Phase 5D**: Department & Training Site Roster Views with Capacity Utilization
- **Phase 5E**: Operational Reports & Data Export Engine (Excel/PDF/CSV)
- **Phase 5F**: Security Isolation, Performance Benchmarking & End-to-End Hardening

---

### 26. Definition of Done

Phase 5 will be considered complete only if:
- [ ] `is_current` migration and transactional current-version designation are implemented and tested.
- [ ] Published placement immutability remains strictly enforced.
- [ ] Post-publication supervisor reassignment works with audit logging and active person validation.
- [ ] Student Schedule, Department Roster, Site Roster, and Supervisor Views are operational in backend and frontend.
- [ ] Unassigned student operational report is functional.
- [ ] Operational export engines (Excel/CSV/PDF) are functional.
- [ ] RBAC permissions and data isolation controls are verified.
- [ ] All queries operate in $O(1)$ query count with zero N+1 regressions.
- [ ] Baseline test suite (122 backend, 13 frontend) remains 100% green alongside new Phase 5 tests.
- [ ] Documentation report `docs/PHASE_5_IMPLEMENTATION_REPORT.md` is complete.

---

### 27. Risks

1. **Database Migration Risk**: Adding `is_current` requires updating existing database rows cleanly without breaking existing test seeders.
2. **Data Leakage Risk**: Supervisors or students viewing schedules must not gain unauthorized access to other cohorts or departments.
3. **PDF/Excel Export Performance**: Large cohort PDF exports must be buffered properly to avoid memory exhaustion.

---

### 28. Final Readiness Assessment

**VERDICT: READY FOR PHASE 5 SPECIFICATION APPROVAL**

The existing system foundation (Phases 3B, 4A, 4B, 4C) is completely verified, stable, and tested with 100% passing tests. The business rules and architectural boundaries for Phase 5 are fully specified. Implementation may begin upon user approval.

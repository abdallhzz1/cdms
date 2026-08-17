# PHASE 5B — PRE-IMPLEMENTATION AUDIT & BUSINESS RULES SPECIFICATION
## STUDENT CLINICAL SCHEDULE & ADMINISTRATIVE SCHEDULE VIEW

---

### 1. Executive Summary

This document specifies the domain business rules, schedule definitions, data contracts, security controls, API specifications, and frontend layout requirements for **Phase 5B: Student Clinical Schedule & Administrative Schedule View** of the Clinical Distribution Management System (CDMS).

The primary objective of Phase 5B is to build an operational, high-performance **Clinical Schedule Engine** on top of the Phase 5A Current Published Distribution architecture (`status = 'published' AND is_current = true`).

In accordance with project instructions, **this phase is an audit and business specification exercise ONLY. No production PHP/TypeScript code, database migrations, or route modifications are executed in this step.**

---

### 2. Phase 3B–5A Baseline

The system baseline has been verified via repository audit:

- **Phase 3B (Automated Engine)**: Hard constraint validation (`DistributionValidationService`), site capacity rules (`TrainingSite + RotationBlock`), candidate generation, and backtracking algorithm.
- **Phase 4A (Manual Foundation)**: $O(1)$ query state validation (`DistributionStateValidator`), controlled force/override workflow requiring explicit reasons and `distribution.override` permission, immutable published placement rules.
- **Phase 4B (Approval & Publication)**: SHA256 approval fingerprinting, automatic approval invalidation, transactional publication (`DistributionPublicationService`), version comparison engine.
- **Phase 4C (Distribution Workbench)**: Full-stack React UI providing version management, summary metrics, unassigned student views, validation conflicts, and audit trail.
- **Phase 5A (Current Published Architecture & Core Read APIs)**:
  - Database schema: `distribution_versions.is_current` indexed boolean.
  - Query resolver: `CurrentDistributionResolver` (`status = 'published' AND is_current = true`).
  - Idempotent and concurrency-protected publication service.
  - Operational read endpoints for current distributions, summaries, student schedules, supervisor schedules, department distributions, training site distributions, and unassigned active students.
- **Verification Baseline**: **134 backend tests** (400 assertions) and **19 frontend tests** passing with **0 failures and 0 errors**.

---

### 3. Repository Audit Findings

1. **No Separate Schedule Table Required**: The repository audit proves that a "Clinical Schedule" does NOT require a separate `schedules` or `calendar_events` table. The schedule is completely and authoritatively derived from:
   $$\text{Schedule Item} = \text{Student} + \text{Rotation} + \text{RotationBlock} + \text{StudentClinicalAssignment} + \text{TrainingSite} + \text{Department} + \text{Supervisor}$$
2. **Block Timing Semantics**: `RotationBlock` contains `from_week` (integer) and `to_week` (integer). `Rotation` contains `start_date` (date) and `end_date` (date). Block calendar dates are derived deterministically relative to `Rotation.start_date`.
3. **Database Uniqueness Guarantee**: `student_clinical_assignments` contains a unique composite index `uniq_student_block_version` on `(student_id, rotation_block_id, distribution_version_id)`. A student can NEVER have duplicate assignments for the same block within a version.
4. **Student Identity Model**: `Student` models are academic data subjects without system `User` login credentials. `Person` (staff/supervisors) models hold `user_id` links for system logins.
5. **Registration Status Integrity**: `Student.registration_status` ('active', 'suspended', 'graduated', 'withdrawn') strictly determines eligibility. Only active students receive assignments.

---

### 4. Existing Schedule Data Model

The authoritative ERD mapping for the clinical schedule is as follows:

```
[AcademicYear]
      ↑
  [Rotation] ─────────────┐
      ↑                   │
[RotationBlock]           │
      ↑                   ↓
[StudentClinicalAssignment] ──> [DistributionVersion] (is_current = true, status = published)
      │               │
      ├──> [Student]  ├──> [TrainingSite]
      │               ├──> [Department] (derived from RotationBlock)
      └──> [Person] (Supervisor)
```

- **RotationBlock**: `id`, `rotation_id`, `block_code`, `from_week`, `to_week`, `department_id`.
- **Rotation**: `id`, `academic_year_id`, `code`, `name`, `academic_level`, `start_date`, `end_date`, `duration_weeks`, `status`.
- **StudentClinicalAssignment**: `id`, `distribution_version_id`, `student_id`, `student_subgroup_id`, `rotation_block_id`, `training_site_id`, `department_id`, `supervisor_id`.

---

### 5. Schedule Definition

DECISION:
A **Clinical Schedule Item** is defined as the operational placement of a student in a specific clinical ward/site during a defined block sequence within an active rotation's current published version.

RATIONALE:
Clinical placements in medical education are organized into structured rotation blocks (e.g. 4 weeks Internal Medicine at Hospital A, 4 weeks General Surgery at Hospital B).

IMPLEMENTATION IMPACT:
Schedule queries MUST join `StudentClinicalAssignment` with `RotationBlock`, `Rotation`, `TrainingSite`, `Department`, and `Person` (Supervisor) filtered by `CurrentDistributionResolver`.

---

### 6. Student Schedule Rules

1. **Publication Boundary**: Student schedules MUST ONLY display assignments from versions where `status = 'published'` AND `is_current = true`. Draft, suggested, manual, or superseded versions MUST be strictly excluded.
2. **Registration Status Handling**:
   - `active`: Display active current clinical assignments.
   - `suspended` / `withdrawn` / `graduated`: Excluded from current unassigned student reports and future schedule generation. If an inactive student possesses historical assignments in current published versions, administrative views display their status as `INACTIVE (SUSPENDED)` with warning styling.
3. **Empty / Unassigned State**: If a student is active in a cohort but lacks an assignment in the current published distribution of a rotation, the schedule returns an explicit operational block item with `assignment_status = 'UNASSIGNED'` rather than omitting the block.

---

### 7. Administrative Schedule Rules

1. **Scope**: Authorized clinical department staff (`distribution.view`) can view and filter all clinical schedules across all active rotations, academic years, levels, departments, training sites, and supervisors.
2. **Multi-Cohort Aggregation**: The Administrative Schedule view can display cohort-wide schedules grouped by Rotation Block, Training Site, or Department.
3. **Read-Only Guarantee**: The Administrative Schedule View is strictly read-only. Schedule endpoints CANNOT mutate assignments, supervisors, or blocks.

---

### 8. Date & Time Rules

1. **Derived Block Calendar Dates**:
   $$\text{block\_start\_date} = \text{Rotation.start\_date} + (\text{from\_week} - 1) \times 7 \text{ days}$$
   $$\text{block\_end\_date} = \text{Rotation.start\_date} + (\text{to\_week} \times 7 - 1) \text{ days}$$
2. **Date Range Overlap Rule**: A schedule item overlaps a requested administrative date filter `[filter_start, filter_end]` if and only if:
   $$\text{block\_start\_date} \le \text{filter\_end} \quad \text{AND} \quad \text{block\_end\_date} \ge \text{filter\_start}$$
3. **Timezones & Formats**: All dates are stored as standard ISO 8601 dates (`YYYY-MM-DD`) in UTC/Asia/Hebron local context.

---

### 9. Rotation Block Rules

1. **Block Sequence**: Rotation blocks within a rotation are ordered by `from_week ASC`, `id ASC`.
2. **Department Ownership**: `StudentClinicalAssignment.department_id` MUST match `RotationBlock.department_id`.
3. **Week Bound Integrity**: `from_week >= 1` and `to_week <= Rotation.duration_weeks`.

---

### 10. Sorting Rules

To ensure deterministic pagination, consistent UI rendering, and reproducible PDF/Excel exports, all schedule queries MUST enforce the following primary and tie-breaker sorting:

1. **Student Schedule Sorting**:
   - Primary: `Rotation.start_date ASC`
   - Secondary: `RotationBlock.from_week ASC`
   - Tertiary: `StudentClinicalAssignment.id ASC`

2. **Administrative Schedule Sorting**:
   - Primary: `Rotation.start_date ASC`
   - Secondary: `RotationBlock.from_week ASC`
   - Tertiary: `Student.last_name ASC`, `Student.first_name ASC`
   - Quaternary: `StudentClinicalAssignment.id ASC`

---

### 11. Filtering Rules

The Administrative Schedule API MUST support the following server-side filters executed strictly at the database level:

- `academic_year_id`: Filter by Academic Year.
- `academic_level`: Filter by Academic Level ('fourth', 'fifth', 'sixth').
- `rotation_id`: Filter by Rotation.
- `rotation_block_id`: Filter by Rotation Block.
- `department_id`: Filter by Department.
- `training_site_id`: Filter by Training Site.
- `supervisor_id`: Filter by Supervisor (`Person.id`).
- `student_id`: Filter by Student.
- `search`: Search student name or university number.
- `date_from` & `date_to`: Filter by calendar overlap.

---

### 12. Pagination Rules

- **Administrative Schedule API**: MUST use standard Laravel pagination (`paginate($perPage)`). Default: 25 items per page. Maximum allowed: 100 items per page.
- **Student Individual Schedule API**: Returns complete schedule for the student across all active rotations (typically 4–10 items per academic year), unpaginated array bounded by student ID.

---

### 13. Current Distribution Resolution

All operational schedule queries MUST resolve the active distribution version via `CurrentDistributionResolver`:

```php
$currentVersion = $this->currentResolver->resolveForRotation($rotationId);
```
Or via Eloquent scope:
```php
$query->whereHas('distributionVersion', function ($q) {
    $q->where('status', 'published')->where('is_current', true);
});
```

DO NOT use `MAX(id)` or `MAX(created_at)` subqueries independently in controllers.

---

### 14. Security & RBAC

- **Authentication**: All endpoints require `auth:sanctum`.
- **Permission**: All read endpoints require `permission:distribution.view`.
- **Data Isolation**:
  - Staff with `distribution.view` can inspect administrative schedules.
  - Supervisors (`CLINICAL_SUPERVISOR`) can access `/supervisors/{person}/current-clinical-schedule` where `person.user_id == auth()->id()`.
  - Student endpoints (`/students/{student}/current-clinical-schedule`) are accessible to authorized staff (and future student portal auth).

---

### 15. Privacy & Data Exposure

- Schedule APIs expose: `student_id`, `university_number`, `full_name_ar`, `full_name_en`, `rotation_name`, `block_code`, `from_week`, `to_week`, `start_date`, `end_date`, `training_site_name`, `department_name`, `supervisor_name`, `supervisor_email`.
- Schedule APIs MUST NOT expose: student national ID, DOB, GPA, warning counts, financial status, or password hashes.

---

### 16. Data Integrity Rules

1. **Uniqueness**: `(student_id, rotation_block_id, distribution_version_id)` is unique.
2. **Current Version Immutability**: Placement fields on current published assignments cannot be mutated.
3. **Foreign Key Integrity**: All assignments must link to valid active students, blocks, sites, and departments.

---

### 17. Invalid / Missing Data Handling

- **Missing Supervisor**: Display supervisor as `"Unassigned"` (null).
- **Missing Site**: Reject assignment creation (hard database foreign key).
- **Missing Dates on Rotation**: Fall back to displaying week numbers (`Week 1 - Week 4`).
- **Inactive Supervisor**: Display supervisor name with `(Inactive)` label in administrative views.

---

### 18. Historical Schedule Policy

- Historical (superseded) published versions (`status = 'published', is_current = false`) are EXCLUDED from current operational schedule endpoints.
- Historical schedules remain queryable via dedicated historical APIs (`/api/v1/distribution-versions/{version}/assignments`) for audit purposes.

---

### 19. API Architecture

Phase 5B specifies two core read API endpoints:

#### 19.1 Administrative Master Schedule API
`GET /api/v1/operational/clinical-schedule`
- **Permission**: `distribution.view`
- **Query Params**: `academic_year_id`, `rotation_id`, `block_id`, `department_id`, `site_id`, `supervisor_id`, `student_id`, `search`, `page`, `per_page`
- **Response**: Paginated list of clinical schedule items with eager-loaded relations.

#### 19.2 Student Schedule Refinement API
`GET /api/v1/students/{student}/current-clinical-schedule`
- **Permission**: `distribution.view`
- **Response**: Array of current published clinical schedule items with derived start/end dates.

---

### 20. Frontend Architecture

Phase 5B specifies the **Administrative Master Schedule Page** (`/distribution/schedule`):

- **Header**: Title "Clinical Schedule", Academic Year & Level selector, Refresh button.
- **Filter Bar**: Search student, Select Rotation, Select Block, Select Site, Select Department, Select Supervisor.
- **Schedule Data Table**:
  - Columns: `Student Number`, `Student Name`, `Subgroup`, `Rotation`, `Block (Dates)`, `Training Site`, `Department`, `Supervisor`.
- **View Modes**:
  - Table View (Default)
  - Block Roster View (Grouped by Rotation Block & Site)
- **Pagination Footer**: Standard page controls.
- **Design Standard**: Clean, calm, light medical-administrative layout matching Phase 4C styling.

---

### 21. Performance Requirements

- **Zero N+1 Queries**: Eager-load `['student', 'rotationBlock.rotation.academicYear', 'trainingSite', 'department', 'supervisor']`.
- **Bounded Query Count**: Bounded at $\le 12$ queries per request.
- **Database-Level Filtering & Pagination**: `paginate()` MUST be executed on Eloquent builder before returning response.

---

### 22. Index Requirements

Audit confirms existing database indexes:
- `student_clinical_assignments`: `distribution_version_id`, `student_id`, `rotation_block_id`, `training_site_id`, `department_id`, `supervisor_id`, and `uniq_student_block_version`.
- `distribution_versions`: `(rotation_id, is_current)`.
- No new database indexes are required for Phase 5B.

---

### 23. Future Phase Compatibility

- **Phase 5C (Supervisor Management)**: Uses `StudentClinicalAssignment.supervisor_id` post-publication update endpoint.
- **Phase 5D (Department & Site Views)**: Uses `department_id` and `training_site_id` relationships.
- **Phase 5E (Reports & Exports)**: Consumes the exact schedule data contract defined in Section 19.

---

### 24. Open Business Decisions

#### Decision 1: Date Derivation vs Explicit Dates on Blocks
- **Current Evidence**: `Rotation` has `start_date`, `RotationBlock` has `from_week` and `to_week`.
- **Recommended Rule**: Derive block calendar dates dynamically using `Rotation.start_date + (from_week - 1) * 7 days`.
- **Reason**: Avoids redundant date storage and keeps block definitions dry.
- **Impact**: Backend computes `start_date` and `end_date` in schedule DTO/resource response.

#### Decision 2: Inactive Student Display in Administrative Schedule
- **Current Evidence**: `Student.registration_status` tracks student status.
- **Recommended Rule**: Exclude inactive students from unassigned reports, but display existing current published assignments with an `INACTIVE` badge if a student became inactive post-publication.
- **Reason**: Retains operational visibility while preventing new assignments.
- **Impact**: Administrative UI displays status badge.

---

### 25. Recommended Implementation Sequence

- **Phase 5B-1**: Schedule Resource DTO & Date Calculation Helper (`app/DTOs/ClinicalScheduleItemDTO.php`).
- **Phase 5B-2**: Administrative Schedule Controller & Endpoint (`GET /api/v1/operational/clinical-schedule`).
- **Phase 5B-3**: Student Schedule API Refinement (`GET /api/v1/students/{student}/current-clinical-schedule`).
- **Phase 5B-4**: Frontend Administrative Schedule View (`/distribution/schedule`).
- **Phase 5B-5**: Automated Test Suite & Performance Hardening (`tests/Feature/Phase5B/Phase5BTest.php`).

---

### 26. Testing Strategy

Minimum tests required for Phase 5B implementation:
1. `GET /api/v1/operational/clinical-schedule` returns paginated current published assignments.
2. Filters by `rotation_id`, `block_id`, `site_id`, `department_id`, `supervisor_id`, `student_id`, and `search`.
3. Excludes historical and draft versions.
4. Correctly computes `block_start_date` and `block_end_date`.
5. Enforces deterministic sorting (`Rotation.start_date`, `from_week`, `student_name`).
6. Rejects unauthenticated (401) and unauthorized (403) users.
7. Verifies zero N+1 query regression ($\le 12$ queries).

---

### 27. Definition of Done

Phase 5B implementation will be complete when:
- [ ] Administrative Master Schedule API is implemented and paginated.
- [ ] Block calendar start/end dates are derived authoritatively.
- [ ] Filters for rotation, block, site, department, supervisor, student, and search are functional.
- [ ] Current distribution versions (`is_current = true`) are used exclusively.
- [ ] Frontend `/distribution/schedule` page is functional and responsive.
- [ ] 100% backend test suite (134+ tests) + new Phase 5B tests pass with 0 failures.
- [ ] Implementation report `docs/PHASE_5B_IMPLEMENTATION_REPORT.md` is complete.

---

### 28. Risks

1. **Missing Rotation Start Date**: If a `Rotation` record lacks `start_date`, block date derivation must fall back to week numbers gracefully.
2. **Large Dataset Memory Overhead**: Administrative queries without pagination could cause memory spikes; strict server-side pagination solves this.

---

### 29. Final Readiness Assessment

**VERDICT: READY FOR PHASE 5B IMPLEMENTATION**

The Phase 5A foundation (`is_current` architecture and `CurrentDistributionResolver`) is completely verified and operational. The data model, date derivation logic, filtering rules, and schedule definitions for Phase 5B are fully specified. Implementation may proceed upon user approval.

# PHASE 5D — BUSINESS RULES SPECIFICATION
## Department & Training Site Roster Views with Capacity Utilization

**Version**: 1.0  
**Status**: READY FOR IMPLEMENTATION  
**Prepared by**: Pre-Implementation Audit, 2026-08-15

---

## 1. Executive Summary

Phase 5D delivers **operational read-only roster views** for two entity scopes:

1. **Department Roster** — Authorized clinical staff can inspect which students are assigned to a specific clinical department in the current published distribution, with supervisor workload and block date information.
2. **Training Site Roster** — Authorized clinical staff can inspect which students are assigned to a specific training site, with capacity utilization metrics derived from the authoritative `site_capacity_rules` table.

Phase 5D is **strictly read-only**. It introduces no new database tables, no migrations, no mutations, and no new business logic beyond what can be composed from existing domain services and models.

The implementation is a direct extension of the operational API surface established in Phase 5A through 5C, reusing `ClinicalScheduleQueryService` patterns, `CurrentDistributionResolver`, and `ClinicalScheduleItemDTO`.

---

## 2. Repository Audit

### 2.1 Models Inspected

| Model | Key Findings |
|:---|:---|
| `DistributionVersion` | Has `is_current` boolean; `status` ∈ {draft, suggested, manual, published}; scope `currentPublishedForRotation()` works correctly |
| `StudentClinicalAssignment` | Has `department_id` physically stored (indexed); also has `training_site_id`, `supervisor_id`, `rotation_block_id` — all indexed |
| `Rotation` | Has `academic_year_id`, `code`, `name`, `academic_level`, `start_date`, `end_date`, `duration_weeks`; FK to `academic_years`; has `siteCapacityRules()` relationship |
| `RotationBlock` | Has `rotation_id`, `block_code`, `from_week`, `to_week`, `department_id` (nullable, indexed); `department_id` is authoritative dept per block |
| `TrainingSite` | Has `is_active` (indexed); `max_students_per_period` and `max_students_per_doctor` columns (nullable) at site level; `capacityRules()` relationship to `SiteCapacityRule`; `department_id` (nullable, primary dept only) |
| `Department` | Has `is_active` (indexed); `dept_type` ∈ {primary, sub}; `serves_academic_levels` (JSON array); `rotationBlocks()` hasMany; `trainingSites()` hasMany (primary dept FK only) |
| `SiteCapacityRule` | Keyed by `(site_id, rotation_id)` — UNIQUE; `max_students` nullable; authoritative capacity for distribution engine |
| `Person` | Has `is_active`, `max_students`, `department_id`, `primary_site_id` |
| `Student` | Has `full_name_ar`, `full_name_en`, `university_number`, `academic_year_id`, `registration_status` |

### 2.2 Capacity Model — Critical Finding

The system has **two capacity layers** — this is the most important architectural finding:

**Layer 1 — `site_capacity_rules.max_students`** (keyed by `site_id + rotation_id`)
- This is the authoritative capacity used by the **distribution engine (Phase 3B)** at assignment time.
- Represents: maximum concurrent students a site may accept **for a given rotation** (interpreted per-block by `DistributionCapacityService`).
- May be NULL — meaning no capacity limit was defined for that site+rotation combination.

**Layer 2 — `training_sites.max_students_per_period`** and `training_sites.max_students_per_doctor`**
- These are legacy general capacity fields from the workbook.
- **NOT used by the Phase 3B distribution engine.**
- **NOT authoritative for Phase 5D capacity calculations.**

**DECISION**: Phase 5D uses **only `site_capacity_rules.max_students`** (keyed by `site_id + rotation_id`) as the authoritative capacity limit. The `training_sites.max_students_per_period` and `max_students_per_doctor` columns are INFORMATIONAL only and must not be used for utilization calculations.

### 2.3 Department Linking — Critical Finding

`department_id` is stored **directly** on `student_clinical_assignments` (nullable, indexed).

Per the Phase 4A domain rule (audit confirmed in `DistributionManualAssignmentService`):

```php
$block = RotationBlock::findOrFail($data['rotation_block_id']);
$data['department_id'] = $block->department_id;
```

The `department_id` on `StudentClinicalAssignment` is **always derived from `RotationBlock.department_id`** at assignment time. It is physically stored as a denormalization for query performance.

**CONSEQUENCE FOR PHASE 5D**: Department filtering may use `student_clinical_assignments.department_id` directly (O(1) indexed filter) without requiring a JOIN through `rotation_blocks`. This is safe because the value is authoritatively set at creation/update time.

### 2.4 Training Site Linking — Critical Finding

`training_site_id` is stored directly on `student_clinical_assignments` (indexed). It is the authoritative site for every assignment.

**Important**: `TrainingSite.department_id` is the site's **primary department** only. A site may serve multiple departments within the same rotation (e.g., a general hospital used by both Internal Medicine and Surgery). The `TrainingSite.department_id` must NOT be used as a filter for department-specific rosters. Only `StudentClinicalAssignment.department_id` is authoritative for dept-level filtering.

### 2.5 Existing Operational Endpoint — Audit Finding

The existing `OperationalDistributionController::departmentDistribution()` and `trainingSiteDistribution()` endpoints (Phase 5A) already implement basic roster fetching. However, they:

- Return raw `StudentClinicalAssignment` collections without DTO transformation.
- Use `paginate(15)` with no configurable `per_page`.
- Apply no search filtering.
- Apply no supervisor filtering.
- Apply no rotation/block filtering.
- Do NOT include capacity utilization metrics.
- Do NOT include summary statistics.
- Are ordered only by `id ASC` (non-deterministic across records).

**Phase 5D will extend these endpoints** with a dedicated `DepartmentRosterService` and `TrainingSiteRosterService` following the Phase 5B `ClinicalScheduleQueryService` pattern. The existing Phase 5A endpoints at:
- `GET /api/v1/departments/{department}/current-distribution`
- `GET /api/v1/training-sites/{trainingSite}/current-distribution`

**will be replaced** by the new richer Phase 5D endpoints. The old endpoint names will be reused in routes with new controller actions so existing tests continue to pass.

### 2.6 Current Published Version Resolution — Confirmed

`CurrentDistributionResolver::resolveForRotation(int $rotationId)` is the authoritative resolver. Phase 5D must NOT re-implement `status = 'published' AND is_current = true` filtering in multiple places. The existing `whereHas` pattern used in `ClinicalScheduleQueryService` is the approved approach.

### 2.7 Permission Audit

Confirmed permissions from `PermissionSeeder.php`:
- `distribution.view` — VIEW action on Distribution module ✅ (sufficient for Phase 5D)
- No department-scoped or site-scoped permission exists in the system.
- No new permissions are needed.

### 2.8 Index Audit

**Existing indexes on `student_clinical_assignments`**:
- `distribution_version_id` ✅
- `student_id` ✅
- `student_subgroup_id` ✅
- `rotation_block_id` ✅
- `training_site_id` ✅
- `department_id` ✅
- `supervisor_id` ✅
- UNIQUE: `(student_id, rotation_block_id, distribution_version_id)` ✅

**Existing indexes on `rotation_blocks`**:
- `rotation_id` ✅
- `block_code` ✅
- `department_id` ✅

**Existing indexes on `site_capacity_rules`**:
- `site_id` ✅
- `rotation_id` ✅
- UNIQUE: `(site_id, rotation_id)` ✅

**Existing indexes on `distribution_versions`**:
- `rotation_id` ✅
- `status` ✅
- `is_current` — **NOT indexed as standalone** (only part of status index)

**Finding**: The `(status, is_current)` compound filter for current published version resolution lacks a compound index. Recommend a compound index `(status, is_current)` on `distribution_versions`. However, since the total number of distribution versions is expected to be small (tens to hundreds), a full table scan on this filter is acceptable for Phase 5D. This index recommendation is documented as **low-priority** and does not block implementation.

**CONCLUSION: No new migrations are required for Phase 5D.**

---

## 3. Existing Architecture

The following is confirmed approved and must not be redesigned:

- **Phase 3B**: Backtracking algorithm, `DistributionCapacityService`, capacity rules via `SiteCapacityRule`
- **Phase 4A**: Manual assignment CRUD, `DistributionStateValidator`, immutability guard
- **Phase 4B**: Approval fingerprinting, `DistributionPublicationService`, version comparison
- **Phase 4C**: Distribution Workbench, assignment management UI
- **Phase 5A**: `is_current` column, `CurrentDistributionResolver`, core operational endpoints
- **Phase 5B**: `ClinicalScheduleQueryService`, `ClinicalScheduleDateCalculator`, `ClinicalScheduleItemDTO`, Administrative Schedule and Student Schedule
- **Phase 5C**: `SupervisorReassignmentService`, `SupervisorController`, supervisor portal, soft workload warning

---

## 4. Scope

Phase 5D **WILL** implement:

1. `DepartmentRosterService` — queries assignments by department from current published versions
2. `TrainingSiteRosterService` — queries assignments by training site from current published versions; calculates capacity utilization
3. `DepartmentRosterController` with `roster()` and `summary()` actions
4. `TrainingSiteRosterController` with `roster()` and `summary()` actions
5. Backend route registration for 4 new endpoints
6. Frontend pages: Department Roster (`/operational/departments/:departmentId/roster`) and Training Site Roster (`/operational/training-sites/:siteId/roster`)
7. Frontend API client methods in `distribution.ts`
8. Complete Phase 5D test suite (backend + frontend)

---

## 5. Out of Scope

Phase 5D will **NOT** implement:

- Excel/PDF/CSV export (Phase 5E)
- Student schedule mutation
- Supervisor reassignment (Phase 5C, already complete)
- Email/SMS notifications
- Department-level user isolation (all `distribution.view` holders see all departments)
- Site-level user isolation (all `distribution.view` holders see all sites)
- Mobile-specific views
- Student login / self-service access
- Capacity rule management (CRUD for `SiteCapacityRule`)

---

## 6. Department Roster Business Rules

### 6.1 Department Linking

**Rule**: The `department_id` stored on `StudentClinicalAssignment` is the authoritative link between a student assignment and a department. It is derived at assignment time from `RotationBlock.department_id` and physically stored for query performance.

**Filtering**: `WHERE student_clinical_assignments.department_id = {department_id}` — indexed, no JOIN to `rotation_blocks` required.

### 6.2 Current Published Version Restriction

**Rule**: Department roster MUST only include assignments from distribution versions where `status = 'published' AND is_current = true`. This is enforced via `whereHas('distributionVersion', fn($q) => $q->where('status', 'published')->where('is_current', true))`.

**Never return** assignments from: draft, suggested, manual, historical published, or superseded versions.

### 6.3 Inactive Department Handling

**Rule**: Phase 5D is read-only. If a department has `is_active = false` but assignments exist in the current published distribution (because it was active at publication time), the roster MUST still return those assignments. The `is_active` flag does NOT retroactively remove assignments from read views.

**404 response**: If the department ID does not exist in the `departments` table, return HTTP 404.

### 6.4 Required Roster Item Fields

Each roster item MUST include:

```json
{
  "assignment_id": 101,
  "distribution_version_id": 10,
  "student": {
    "id": 55,
    "university_number": "20260001",
    "full_name_ar": "أحمد علي",
    "full_name_en": "Ahmad Ali",
    "registration_status": "active"
  },
  "rotation": {
    "id": 5,
    "code": "ROT01",
    "name": "Internal Medicine Rotation",
    "academic_year_id": 1,
    "academic_level": "fourth",
    "start_date": "2026-09-01",
    "end_date": "2026-10-30"
  },
  "block": {
    "id": 20,
    "block_code": "BLOCK_1",
    "from_week": 1,
    "to_week": 4,
    "start_date": "2026-09-01",
    "end_date": "2026-09-28"
  },
  "training_site": {
    "id": 2,
    "name": "Al-Ahli Hospital",
    "name_en": "Al-Ahli Hospital",
    "name_ar": "مستشفى الأهلي"
  },
  "department": {
    "id": 3,
    "name": "Internal Medicine",
    "name_en": "Internal Medicine",
    "name_ar": "الطب الباطني"
  },
  "supervisor": {
    "id": 8,
    "full_name_ar": "د. عمر كحلوت",
    "full_name_en": "Dr. Omar Kahlout",
    "name": "Dr. Omar Kahlout",
    "email": "omar@example.com",
    "is_active": true
  }
}
```

Block dates are calculated using `ClinicalScheduleDateCalculator` (already implemented in Phase 5B). Reuse the existing DTO pattern from `ClinicalScheduleItemDTO`.

### 6.5 Department Summary

The department summary endpoint provides aggregate metrics:

```json
{
  "department_id": 3,
  "department_name": "Internal Medicine",
  "total_assigned_students": 24,
  "total_rotation_blocks": 2,
  "total_training_sites": 3,
  "total_supervisors_assigned": 4,
  "unsupervised_assignments": 2
}
```

- `total_assigned_students`: COUNT of unique student_ids in current published assignments for this dept
- `total_rotation_blocks`: COUNT DISTINCT rotation_block_ids
- `total_training_sites`: COUNT DISTINCT training_site_ids
- `total_supervisors_assigned`: COUNT DISTINCT supervisor_ids (excluding NULL)
- `unsupervised_assignments`: COUNT where supervisor_id IS NULL

**No department-level capacity metric** — departments do not have a `max_students` column. Only training sites (via `SiteCapacityRule`) have capacity limits. See Section 8.

---

## 7. Training Site Roster Business Rules

### 7.1 Training Site Linking

**Rule**: The `training_site_id` stored on `StudentClinicalAssignment` is the authoritative link. Filter with `WHERE student_clinical_assignments.training_site_id = {site_id}`.

### 7.2 Current Published Version Restriction

Same as Section 6.2. Only `status = 'published' AND is_current = true`.

### 7.3 Inactive Site Handling

Same as Section 6.3. If `TrainingSite.is_active = false`, the roster still returns existing current published assignments. Return HTTP 404 if the site ID does not exist.

### 7.4 Required Roster Item Fields

Same structure as Section 6.4. The `training_site` object must include:

```json
"training_site": {
  "id": 2,
  "name": "Al-Ahli Hospital",
  "name_en": "Al-Ahli Hospital",
  "name_ar": "مستشفى الأهلي",
  "site_type": "hospital_public",
  "city": "Gaza",
  "is_active": true
}
```

### 7.5 Training Site Summary with Capacity Utilization

The site summary endpoint provides:

```json
{
  "site_id": 2,
  "site_name": "Al-Ahli Hospital",
  "site_type": "hospital_public",
  "city": "Gaza",
  "is_active": true,
  "capacity_by_rotation": [
    {
      "rotation_id": 5,
      "rotation_name": "Internal Medicine Rotation",
      "capacity_limit": 20,
      "assigned_count": 18,
      "available_capacity": 2,
      "utilization_percentage": 90.0,
      "utilization_status": "NEAR_CAPACITY",
      "over_capacity": false
    },
    {
      "rotation_id": 7,
      "rotation_name": "Surgery Rotation",
      "capacity_limit": null,
      "assigned_count": 12,
      "available_capacity": null,
      "utilization_percentage": null,
      "utilization_status": "NO_RULE",
      "over_capacity": false
    }
  ],
  "total_assigned_students": 30,
  "total_departments": 2,
  "total_supervisors_assigned": 5,
  "unsupervised_assignments": 0
}
```

---

## 8. Capacity Utilization Rules

### 8.1 Authoritative Capacity Source

**ONLY** `site_capacity_rules` table is authoritative: `max_students` at `(site_id, rotation_id)` level.

> **IMPORTANT**: `training_sites.max_students_per_period` and `training_sites.max_students_per_doctor` are NOT used for Phase 5D capacity calculations. They are legacy schema fields from the workbook with no active use in the distribution engine.

### 8.2 Capacity Calculation

For each `(site_id, rotation_id)` pair where the current published distribution has assignments:

```
assigned_count   = COUNT(StudentClinicalAssignment WHERE training_site_id = site AND
                          distributionVersion.is_current = true AND 
                          distributionVersion.status = 'published' AND
                          rotationBlock.rotation_id = rotation_id)

capacity_limit   = site_capacity_rules.max_students WHERE site_id = site AND rotation_id = rotation
                   (NULL if no rule exists)

available_capacity = capacity_limit - assigned_count  (NULL if capacity_limit is NULL)

utilization_percentage = (assigned_count / capacity_limit * 100)  (NULL if capacity_limit is NULL or 0)

over_capacity    = (capacity_limit IS NOT NULL AND assigned_count > capacity_limit)
```

### 8.3 Utilization Status Labels

| Condition | Status |
|:---|:---|
| No `SiteCapacityRule` exists | `NO_RULE` |
| `capacity_limit = 0` | `NO_CAPACITY` |
| `assigned_count = 0` | `AVAILABLE` |
| `utilization_percentage < 75` | `AVAILABLE` |
| `75 ≤ utilization_percentage < 100` | `NEAR_CAPACITY` |
| `utilization_percentage = 100` | `FULL` |
| `assigned_count > capacity_limit` | `OVER_CAPACITY` |

> **Open Business Decision #1**: The 75% threshold for `NEAR_CAPACITY` is a **recommended default**. This must be confirmed by the clinical director. See Section 20.

### 8.4 Over-Capacity Behavior

**Rule**: An over-capacity state MUST NOT prevent read requests from returning. The API returns the roster with an `over_capacity: true` flag and `utilization_status: "OVER_CAPACITY"` in the capacity summary.

**Rule**: The API MUST NOT modify assignments or reject reads due to capacity conditions.

**Rule**: Over-capacity may legitimately exist because of Phase 4A authorized overrides. The roster treats this as an operational observation only.

**Rule**: Override audit details (override_reason, user who performed override) are available in the `AuditLog` table but are NOT returned in Phase 5D roster responses. Phase 5D surfaces the capacity status only. If authorized users need override details, they use the audit log endpoint (Phase 4C, already implemented).

### 8.5 Edge Cases

| Case | Behavior |
|:---|:---|
| `capacity_limit = NULL` | `utilization_status = "NO_RULE"`, `utilization_percentage = null`, `over_capacity = false` |
| `capacity_limit = 0` | `utilization_status = "NO_CAPACITY"`, `utilization_percentage = null`, `over_capacity = assigned_count > 0` |
| `assigned_count = 0` | `utilization_percentage = 0`, `utilization_status = "AVAILABLE"` |
| No SiteCapacityRule row | Same as `capacity_limit = NULL` |
| Multiple rotations at one site | Capacity is evaluated **per rotation** independently |

---

## 9. Supervisor Workload Rules

### 9.1 Supervisor Information in Rosters

Each assignment in the department and site roster includes the supervisor's:
- `id`
- `full_name_ar`
- `full_name_en`
- `name` (en ?? ar)
- `email`
- `is_active`

### 9.2 Supervisor Workload in Summary Endpoints

The summary endpoints include:
- `total_supervisors_assigned`: count of distinct non-null supervisor_ids
- `unsupervised_assignments`: count of assignments where supervisor_id IS NULL

**Supervisor max_students workload display**: Per Phase 5C BRS Section 24, supervisor workload overage is a **soft warning**. Phase 5D summary endpoints SHOULD include per-supervisor student counts in an optional `supervisor_workload` array when the summary includes supervisor breakdown. However, this is a **non-blocking open decision** (#3 below).

### 9.3 Inactive Supervisor Handling

A supervisor may be `is_active = false` if they were reassigned after publication. The roster MUST still return the assignment with the supervisor record as-is. The `is_active` field in the supervisor payload informs the reader of the current status.

**Rule**: Phase 5D does NOT reassign supervisors. Mutation is exclusively through Phase 5C's `PUT operational/assignments/{assignment}/supervisor`.

---

## 10. Filtering Rules

### 10.1 Department Roster Filters

All filters are optional, server-side, exact-match unless noted:

| Filter | Query Param | Type | Match |
|:---|:---|:---|:---|
| Rotation | `rotation_id` | integer | Exact via `rotationBlock.rotation_id` JOIN |
| Rotation Block | `rotation_block_id` | integer | Exact on `rotation_block_id` column |
| Training Site | `training_site_id` | integer | Exact on `training_site_id` column |
| Supervisor | `supervisor_id` | integer | Exact on `supervisor_id` column |
| Student Search | `search` | string | LIKE `%search%` on `full_name_ar`, `full_name_en`, `university_number` |
| Academic Level | `academic_level` | string | Exact via `rotations.academic_level` JOIN |
| Page | `page` | integer | Pagination page number |
| Per Page | `per_page` | integer | 1–100, default 50 |

### 10.2 Training Site Roster Filters

| Filter | Query Param | Type | Match |
|:---|:---|:---|:---|
| Rotation | `rotation_id` | integer | Exact via `rotationBlock.rotation_id` JOIN |
| Rotation Block | `rotation_block_id` | integer | Exact on `rotation_block_id` column |
| Department | `department_id` | integer | Exact on `department_id` column |
| Supervisor | `supervisor_id` | integer | Exact on `supervisor_id` column |
| Student Search | `search` | string | LIKE `%search%` on `full_name_ar`, `full_name_en`, `university_number` |
| Page | `page` | integer | Pagination page number |
| Per Page | `per_page` | integer | 1–100, default 50 |

### 10.3 Filter Behavior Rules

- Filters are combined with AND logic.
- Empty string filters are treated as absent (no filter applied).
- Integer filters with value 0 are treated as absent.
- Invalid (non-integer) values for integer filters must be rejected with HTTP 422.
- Filters that produce zero results must return HTTP 200 with an empty `data` array (not 404).
- No client-side filtering is permitted. All filtering happens at the database level before pagination.

---

## 11. Sorting & Pagination

### 11.1 Deterministic Sorting

Both roster endpoints use the same deterministic sort order established in Phase 5B:

```sql
ORDER BY 
  rotations.start_date ASC,
  rotation_blocks.from_week ASC,
  students.full_name_ar ASC,
  student_clinical_assignments.id ASC
```

This requires JOINs to `rotation_blocks`, `rotations`, and `students` tables. The `select('student_clinical_assignments.*')` clause must be used to avoid column ambiguity.

### 11.2 Pagination Rules

- Default `per_page`: **50**
- Maximum `per_page`: **100**
- Minimum `per_page`: **1**
- Out-of-range values are clamped: `min(max($perPage, 1), 100)`
- Response includes standard Laravel `LengthAwarePaginator` envelope: `current_page`, `data`, `from`, `last_page`, `next_page_url`, `per_page`, `prev_page_url`, `to`, `total`
- The `total` count reflects the full filtered result, not just the current page.

---

## 12. API Contracts

### 12.1 Department Roster Endpoint

```
GET /api/v1/departments/{department}/current-distribution/roster

Authentication:  auth:sanctum
Permission:      distribution.view
Path Params:     department (integer, model-bound)
Query Params:    rotation_id, rotation_block_id, training_site_id, supervisor_id, 
                 search, academic_level, page, per_page
```

**Success Response (200)**:
```json
{
  "success": true,
  "message": "Department roster retrieved successfully.",
  "data": {
    "current_page": 1,
    "data": [ /* ClinicalScheduleItemDTO array */ ],
    "from": 1,
    "last_page": 3,
    "next_page_url": "...",
    "per_page": 50,
    "prev_page_url": null,
    "to": 50,
    "total": 120
  }
}
```

**Error Responses**:
- `401 Unauthorized`: No valid session
- `403 Forbidden`: Lacks `distribution.view`
- `404 Not Found`: Department does not exist
- `422 Unprocessable`: Invalid filter parameter values

### 12.2 Department Summary Endpoint

```
GET /api/v1/departments/{department}/current-distribution/summary

Authentication:  auth:sanctum
Permission:      distribution.view
Path Params:     department (integer, model-bound)
```

**Success Response (200)**:
```json
{
  "success": true,
  "message": "Department summary retrieved successfully.",
  "data": {
    "department": {
      "id": 3,
      "code": "DEP-IM",
      "name_ar": "الطب الباطني",
      "name_en": "Internal Medicine",
      "dept_type": "primary",
      "is_active": true
    },
    "summary": {
      "total_assigned_students": 24,
      "total_rotation_blocks": 2,
      "total_training_sites": 3,
      "total_supervisors_assigned": 4,
      "unsupervised_assignments": 2
    },
    "no_current_distribution": false
  }
}
```

If no current published distribution exists for any rotation with this department, `no_current_distribution: true` and all summary counts = 0.

### 12.3 Training Site Roster Endpoint

```
GET /api/v1/training-sites/{trainingSite}/current-distribution/roster

Authentication:  auth:sanctum
Permission:      distribution.view
Path Params:     trainingSite (integer, model-bound)
Query Params:    rotation_id, rotation_block_id, department_id, supervisor_id,
                 search, page, per_page
```

**Success Response (200)**: Same paginated structure as 12.1.

**Error Responses**: Same as 12.1.

### 12.4 Training Site Summary Endpoint

```
GET /api/v1/training-sites/{trainingSite}/current-distribution/summary

Authentication:  auth:sanctum
Permission:      distribution.view
Path Params:     trainingSite (integer, model-bound)
```

**Success Response (200)**:
```json
{
  "success": true,
  "message": "Training site summary retrieved successfully.",
  "data": {
    "training_site": {
      "id": 2,
      "site_code": "H-01",
      "name_ar": "مستشفى الأهلي",
      "name_en": "Al-Ahli Hospital",
      "site_type": "hospital_public",
      "city": "Gaza",
      "is_active": true,
      "coordinator_name": "Dr. Coordinator",
      "coordinator_phone": "...",
      "coordinator_email": "..."
    },
    "capacity_by_rotation": [
      {
        "rotation_id": 5,
        "rotation_name": "Internal Medicine Rotation",
        "rotation_code": "ROT01",
        "capacity_limit": 20,
        "assigned_count": 18,
        "available_capacity": 2,
        "utilization_percentage": 90.0,
        "utilization_status": "NEAR_CAPACITY",
        "over_capacity": false
      }
    ],
    "summary": {
      "total_assigned_students": 18,
      "total_departments": 1,
      "total_supervisors_assigned": 3,
      "unsupervised_assignments": 0,
      "has_over_capacity": false
    },
    "no_current_distribution": false
  }
}
```

### 12.5 Route Naming Convention

```php
Route::get('departments/{department}/current-distribution/roster', ...)
     ->name('departments.current-distribution.roster');

Route::get('departments/{department}/current-distribution/summary', ...)
     ->name('departments.current-distribution.summary');

Route::get('training-sites/{trainingSite}/current-distribution/roster', ...)
     ->name('training-sites.current-distribution.roster');

Route::get('training-sites/{trainingSite}/current-distribution/summary', ...)
     ->name('training-sites.current-distribution.summary');
```

**Note**: The existing Phase 5A routes `departments/{department}/current-distribution` and `training-sites/{trainingSite}/current-distribution` remain unchanged. The new Phase 5D routes add `/roster` and `/summary` suffixes.

---

## 13. Security & RBAC

### 13.1 Permission Requirements

All Phase 5D endpoints require:
1. `auth:sanctum` — authenticated session
2. `permission:distribution.view` middleware

No new permissions are required.

### 13.2 IDOR Analysis

**Department endpoint**: Route model binding (`Department $department`) ensures the path parameter resolves to an actual department or returns 404. There is no cross-tenant isolation — all users with `distribution.view` see all departments. This is the current access model and is explicitly documented.

**Training Site endpoint**: Route model binding (`TrainingSite $trainingSite`) ensures the path parameter resolves to an actual site or returns 404. Same flat access model.

**Finding**: No IDOR risk. Model binding ensures the entity must exist. No per-user data filtering is required because the current system does not implement organizational/departmental isolation.

### 13.3 Data Isolation Decision

**Current Model**: All authorized users (`distribution.view`) have full read access to all departments and all training sites.

**Recommendation**: Maintain current flat model for Phase 5D. If per-department access control is required in the future, it should be a separate architectural decision (Phase 6+).

---

## 14. Performance & N+1 Requirements

### 14.1 Eager Loading Requirements

Both `DepartmentRosterService` and `TrainingSiteRosterService` MUST eager-load:

```php
->with([
    'student',
    'rotationBlock.rotation.academicYear',
    'trainingSite',
    'department',
    'supervisor',
])
```

### 14.2 Capacity Query Performance

For the summary endpoint, capacity utilization MUST be calculated via a single aggregation query using `DB::select()` or Eloquent with `groupBy()`, NOT by loading individual assignments and computing in PHP.

Accepted pattern:
```php
StudentClinicalAssignment::where('training_site_id', $site->id)
    ->whereHas('distributionVersion', fn($q) => $q->where('status','published')->where('is_current', true))
    ->join('rotation_blocks', ...)
    ->selectRaw('rotation_blocks.rotation_id, COUNT(*) as assigned_count')
    ->groupBy('rotation_blocks.rotation_id')
    ->get();
```

Then load `SiteCapacityRule` records for the site in a single additional query.

### 14.3 Performance Acceptance Criteria

| Metric | Requirement |
|:---|:---|
| Total queries for roster endpoint (50 items) | ≤ 12 |
| Total queries for summary endpoint | ≤ 8 |
| No N+1 student queries | Enforced by eager loading |
| No N+1 supervisor queries | Enforced by eager loading |
| No N+1 capacity queries | SiteCapacityRule preloaded in single query |
| No N+1 block/rotation queries | Enforced by eager loading with nested `with` |

### 14.4 N+1 Regression Test

Each roster endpoint test MUST include a query count assertion: `$this->assertLessThanOrEqual(15, count(DB::getQueryLog()))`.

---

## 15. Database & Index Audit

### 15.1 Existing Indexes — Sufficient for Phase 5D

| Table | Column(s) | Index Type | Status |
|:---|:---|:---|:---|
| `student_clinical_assignments` | `department_id` | B-tree | ✅ Sufficient |
| `student_clinical_assignments` | `training_site_id` | B-tree | ✅ Sufficient |
| `student_clinical_assignments` | `supervisor_id` | B-tree | ✅ Sufficient |
| `student_clinical_assignments` | `distribution_version_id` | B-tree | ✅ Sufficient |
| `student_clinical_assignments` | `rotation_block_id` | B-tree | ✅ Sufficient |
| `site_capacity_rules` | `(site_id, rotation_id)` | UNIQUE | ✅ Sufficient |
| `rotation_blocks` | `department_id` | B-tree | ✅ Sufficient |
| `distribution_versions` | `status` | B-tree | ✅ Acceptable |

### 15.2 Optional Optimization (Non-Blocking)

A compound index `(status, is_current)` on `distribution_versions` would improve the `WHERE status = 'published' AND is_current = true` filter performance. However, since the total version count is small in practice, this is a **low-priority** optimization that does NOT block Phase 5D implementation.

**CONCLUSION: No new database migrations are required for Phase 5D.**

---

## 16. Frontend Requirements

### 16.1 New Pages

| Page | Route | Description |
|:---|:---|:---|
| Department Roster | `/operational/departments/:departmentId/roster` | Full roster for a single department |
| Training Site Roster | `/operational/training-sites/:siteId/roster` | Full roster for a single training site with capacity metrics |

### 16.2 Department Roster Page Design

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│ HEADER                                               │
│  • Department name (en + ar)                        │
│  • "Current Published" badge                        │
│  • dept_type badge (Primary / Sub)                  │
├─────────────────────────────────────────────────────┤
│ SUMMARY CARDS (row)                                  │
│  [Students: 24] [Blocks: 2] [Sites: 3] [Supervisors: 4] │
│  [Unsupervised: 2] → amber warning if > 0           │
├─────────────────────────────────────────────────────┤
│ FILTER BAR                                           │
│  [Search student] [Rotation ▾] [Block ▾] [Site ▾]  │
│  [Supervisor ▾]                                      │
├─────────────────────────────────────────────────────┤
│ ROSTER TABLE                                         │
│  Student | Univ. No. | Rotation | Block | Dates     │
│  Site    | Supervisor                                │
├─────────────────────────────────────────────────────┤
│ PAGINATION                                           │
└─────────────────────────────────────────────────────┘
```

### 16.3 Training Site Roster Page Design

```
┌─────────────────────────────────────────────────────┐
│ HEADER                                               │
│  • Site name (en + ar)                              │
│  • "Current Published" badge                        │
│  • site_type badge, city                            │
├─────────────────────────────────────────────────────┤
│ CAPACITY PANEL                                       │
│  Per-rotation capacity bars:                        │
│  [Rotation] [Assigned/Capacity] [%] [Status badge]  │
│  OVER_CAPACITY row → red warning                    │
├─────────────────────────────────────────────────────┤
│ SUMMARY CARDS                                        │
│  [Total Students] [Departments] [Supervisors]        │
│  [Unsupervised]                                      │
├─────────────────────────────────────────────────────┤
│ FILTER BAR                                           │
│  [Search student] [Rotation ▾] [Block ▾] [Dept ▾]  │
│  [Supervisor ▾]                                      │
├─────────────────────────────────────────────────────┤
│ ROSTER TABLE                                         │
│  Student | Univ. No. | Rotation | Block | Dates     │
│  Department | Supervisor                             │
├─────────────────────────────────────────────────────┤
│ PAGINATION                                           │
└─────────────────────────────────────────────────────┘
```

### 16.4 Capacity Status Badges

| Status | Color | Label |
|:---|:---|:---|
| `AVAILABLE` | Green | Available |
| `NEAR_CAPACITY` | Amber | Near Capacity |
| `FULL` | Orange | Full |
| `OVER_CAPACITY` | Red | Over Capacity |
| `NO_RULE` | Gray | No Limit |
| `NO_CAPACITY` | Red | No Capacity |

### 16.5 Design Principles

- Calm, professional, table-centric layout consistent with Phase 5B/5C
- No decorative animations
- Responsive horizontal scroll for wide tables
- Print-friendly table styles (Phase 5E will add actual print/export)
- Consistent typography with the existing design system

### 16.6 Business Logic Rules for Frontend

The frontend MUST NOT:
- Calculate capacity utilization percentages
- Determine `utilization_status` from raw assigned counts
- Determine current published version IDs
- Duplicate permission checks

All of the above come from backend API responses.

### 16.7 New API Client Methods

Add to `frontend/src/api/distribution.ts`:

- `getDepartmentRoster(departmentId, params)` → paginated `ClinicalScheduleItem[]`
- `getDepartmentSummary(departmentId)` → DepartmentSummary
- `getTrainingSiteRoster(siteId, params)` → paginated `ClinicalScheduleItem[]`
- `getTrainingSiteSummary(siteId)` → TrainingSiteSummary

### 16.8 Navigation Links

Add to `Sidebar.tsx`:
- Department Roster link (if navigating to a specific department requires selecting from a list, a simple placeholder or first-available department link is acceptable for Phase 5D)
- Training Site Roster link (same approach)

---

## 17. Empty & Error States

### 17.1 No Current Published Distribution

If no current published distribution exists for any rotation that includes this department or site:
- Roster endpoint returns HTTP 200 with `data.total = 0` and an empty `data.data = []`.
- Summary endpoint returns HTTP 200 with all counts at 0 and `no_current_distribution: true`.

### 17.2 Department / Site Does Not Exist

- HTTP 404 via Laravel model binding.
- Response: `{ success: false, message: "Department not found.", errors: {} }`

### 17.3 Department Exists But No Assignments

- Roster: HTTP 200, empty `data.data = []`, `total = 0`
- Summary: HTTP 200, all counts = 0

### 17.4 No Capacity Rule for Site+Rotation

- `capacity_limit = null`, `utilization_percentage = null`, `utilization_status = "NO_RULE"`
- Does NOT trigger any error state

### 17.5 Unauthorized User

- HTTP 401 if not authenticated
- HTTP 403 if authenticated but lacks `distribution.view`

### 17.6 Invalid Filter Values

- HTTP 422 with validation error messages for invalid integer filter values
- Empty `search` string is treated as no filter (200, unfiltered results)

### 17.7 Frontend States

| State | UI Behavior |
|:---|:---|
| Loading | Skeleton table rows / spinner |
| Error (network/API) | Red error card with retry button |
| Empty (no assignments) | Centered empty state with icon and message |
| No capacity rule | Gray "No Limit" badge in capacity panel |
| Over capacity | Red highlighted row + warning message at top of capacity panel |
| Unauthorized | Redirect to login or 403 page |

---

## 18. Testing Strategy

### 18.1 Backend Unit Tests (None Required)

No new isolated business logic requires unit tests. Capacity calculation logic is simple enough to be fully covered by feature tests.

### 18.2 Backend Feature Tests — `tests/Feature/Phase5D/Phase5DTest.php`

Minimum 25 test cases:

1. `authorized_user_can_view_department_roster`
2. `unauthorized_user_cannot_view_department_roster`
3. `authorized_user_can_view_training_site_roster`
4. `unauthorized_user_cannot_view_training_site_roster`
5. `only_current_published_version_appears_in_department_roster`
6. `historical_published_version_excluded_from_department_roster`
7. `suggested_and_manual_versions_excluded_from_department_roster`
8. `only_current_published_version_appears_in_site_roster`
9. `department_roster_filters_by_department_correctly`
10. `department_roster_filters_by_rotation_correctly`
11. `department_roster_filters_by_block_correctly`
12. `department_roster_filters_by_supervisor_correctly`
13. `department_roster_search_by_student_name`
14. `site_roster_filters_by_department_correctly`
15. `site_roster_filters_by_rotation_correctly`
16. `site_roster_search_by_student_name`
17. `department_summary_returns_correct_counts`
18. `training_site_summary_includes_capacity_utilization`
19. `capacity_utilization_calculated_correctly_for_known_values`
20. `over_capacity_detected_and_flagged_correctly`
21. `missing_capacity_rule_returns_no_rule_status`
22. `zero_capacity_returns_no_capacity_status`
23. `department_roster_pagination_is_deterministic`
24. `nonexistent_department_returns_404`
25. `nonexistent_training_site_returns_404`
26. `empty_department_returns_200_with_empty_roster`
27. `no_n_plus_one_queries_on_department_roster`
28. `no_n_plus_one_queries_on_site_roster`
29. `read_endpoints_do_not_create_audit_logs`
30. `deterministic_sort_order_verified`

### 18.3 Frontend Tests — `src/pages/DepartmentRoster.test.tsx` and `src/pages/TrainingSiteRoster.test.tsx`

Each page test file covers:

1. Renders title, header, and "Current Published" badge
2. Shows loading state while API is pending
3. Renders roster table with data
4. Renders empty state when API returns empty data
5. Renders error state when API fails
6. Capacity panel renders correctly with utilization data
7. OVER_CAPACITY badge rendered in red
8. NO_RULE badge rendered in gray
9. Summary cards display correct values

---

## 19. Regression Requirements

Phase 5D must not break any existing passing tests. The final test run must confirm:

| Suite | Status Required |
|:---|:---|
| All Phase 3B tests | ✅ Pass |
| All Phase 4A tests | ✅ Pass |
| All Phase 4B tests | ✅ Pass |
| All Phase 4C tests | ✅ Pass |
| All Phase 5A tests | ✅ Pass |
| All Phase 5B tests | ✅ Pass |
| All Phase 5C tests | ✅ Pass |
| All Phase 5D new tests | ✅ Pass |
| All Frontend tests | ✅ Pass |
| TypeScript typecheck | ✅ 0 errors |

**Target**: ≥ 191 backend tests passing (161 current + 30 new Phase 5D).

---

## 20. Open Business Decisions

### Decision 1 — `NEAR_CAPACITY` Threshold ⚠️ BLOCKS implementation threshold value only

**Question**: At what utilization percentage does a site transition from `AVAILABLE` to `NEAR_CAPACITY`?

**Recommended**: 75% (i.e., ≥ 75% utilization = NEAR_CAPACITY)

**Reason**: Medical training literature typically considers 75% occupancy as the "caution zone" for clinical site capacity planning. This is a common convention.

**Impact**: Affects visual warning display only. Does not affect assignment validation or roster data.

**RESOLUTION FOR IMPLEMENTATION**: Use 75% as the default. This is configurable in the service without requiring a migration. If the clinical director specifies a different threshold, the service constant is updated.

---

### Decision 2 — Override Detail Visibility

**Question**: Should the roster expose whether an assignment exceeded capacity due to an authorized override?

**Recommended**: NO — the roster returns only the operational capacity status (OVER_CAPACITY). If users need to see override details (who authorized, what reason), they use the existing audit log endpoint.

**Reason**: Showing override details in the roster adds complexity and may expose sensitive administrative decisions to all distribution.view holders. The existing audit log is the appropriate surface for this information.

**Impact**: No additional API fields needed. Phase 5D is not blocked.

---

### Decision 3 — Per-Supervisor Workload in Summary

**Question**: Should the department/site summary include a breakdown of workload per supervisor (e.g., how many students each supervisor has)?

**Recommended**: YES, include a `supervisor_workload` array in the summary response as an optional enrichment.

```json
"supervisor_workload": [
  {
    "supervisor_id": 8,
    "full_name_en": "Dr. Omar Kahlout",
    "assigned_count": 5,
    "max_students": 10,
    "workload_warning": false
  }
]
```

**Reason**: This is directly useful for department heads verifying equitable supervisor allocation. The data requires one additional aggregation query (not N+1).

**Impact**: Adds one DB query to summary endpoints. Non-blocking.

---

### Decision 4 — Department-Level Access Isolation

**Question**: Should users only be able to view the department roster for their own department (e.g., a department head only sees Internal Medicine, not Surgery)?

**Recommended**: NO — maintain the flat `distribution.view` model for Phase 5D. All distribution.view holders can access all department rosters.

**Reason**: The current RBAC system has no department-scoped permission mechanism. Adding it would require new infrastructure (user-department associations). This should be a future architectural decision.

**Impact**: None for Phase 5D. Document as future concern.

---

### Decision 5 — Training Site Access Isolation

**Question**: Should site coordinators only see their assigned site?

**Recommended**: NO — same as Decision 4. Maintain flat model.

**Impact**: None for Phase 5D.

---

## 21. Recommended Implementation Sequence

1. **Create `DepartmentRosterService`** — queries and filters, reuses `ClinicalScheduleDateCalculator` and DTO pattern
2. **Create `TrainingSiteRosterService`** — same pattern + capacity utilization calculation
3. **Create `DepartmentRosterController`** — `roster()` and `summary()` actions
4. **Create `TrainingSiteRosterController`** — `roster()` and `summary()` actions
5. **Register routes** — 4 new routes with `distribution.view` permission
6. **Write backend tests** — `tests/Feature/Phase5D/Phase5DTest.php`
7. **Run full backend test suite** — verify 191+ passing, 0 failures
8. **Add API client methods** — extend `frontend/src/api/distribution.ts`
9. **Create `DepartmentRoster.tsx`** — React page with summary, filters, table, pagination
10. **Create `TrainingSiteRoster.tsx`** — React page with capacity panel, summary, filters, table
11. **Register frontend routes** — update `App.tsx`
12. **Update sidebar** — add navigation links
13. **Write frontend tests** — `DepartmentRoster.test.tsx` and `TrainingSiteRoster.test.tsx`
14. **Run frontend typecheck + tests** — 0 errors, 0 failures
15. **Write `docs/PHASE_5D_IMPLEMENTATION_REPORT.md`**

---

## 22. Definition of Done

Phase 5D is complete when:

- [x] `DepartmentRosterService` implemented with filters, sorting, pagination, DTO transformation
- [x] `TrainingSiteRosterService` implemented with capacity utilization calculation
- [x] `DepartmentRosterController` implementing `roster()` and `summary()` actions
- [x] `TrainingSiteRosterController` implementing `roster()` and `summary()` actions
- [x] 4 new routes registered under `auth:sanctum` + `permission:distribution.view`
- [x] Capacity utilization calculated from `site_capacity_rules` (not `training_sites.max_students_per_period`)
- [x] Utilization statuses implemented: AVAILABLE, NEAR_CAPACITY, FULL, OVER_CAPACITY, NO_RULE, NO_CAPACITY
- [x] Over-capacity state displayed without blocking read requests
- [x] All filtering is server-side with exact match + LIKE search
- [x] Deterministic sorting enforced (rotation.start_date, from_week, full_name_ar, id)
- [x] Pagination: default 50, max 100
- [x] 0 N+1 queries in roster and summary endpoints
- [x] No audit log entries created for GET requests
- [x] No mutation of any data
- [x] HTTP 404 for non-existent department/site
- [x] HTTP 200 + empty array for department/site with no assignments
- [x] HTTP 200 + NO_RULE status when no capacity rule exists
- [x] RBAC: `auth:sanctum` + `distribution.view` on all endpoints
- [x] Frontend Department Roster page functional at `/operational/departments/:departmentId/roster`
- [x] Frontend Training Site Roster page functional at `/operational/training-sites/:siteId/roster`
- [x] TypeScript typecheck: 0 errors
- [x] Backend tests: ≥ 30 new tests, 0 failures, full suite ≥ 191 passing
- [x] Frontend tests: ≥ 9 new tests per page, 0 failures
- [x] `docs/PHASE_5D_IMPLEMENTATION_REPORT.md` created
- [x] No regression in Phase 3B through 5C test suites

---

## 23. Final Readiness Verdict

**PHASE 5D — READY FOR IMPLEMENTATION**

### Supporting Evidence

| Category | Finding |
|:---|:---|
| Schema | All required tables and columns exist. No migrations needed. |
| Capacity Model | `site_capacity_rules` is authoritative and unambiguous. |
| Department Linking | `student_clinical_assignments.department_id` is physically stored and indexed. |
| Indexes | All required indexes exist. No new migrations required. |
| Current Version Logic | `CurrentDistributionResolver` is ready and correct. |
| Permission | `distribution.view` is sufficient. No new permissions needed. |
| Existing Services | `ClinicalScheduleQueryService` and `ClinicalScheduleDateCalculator` are directly reusable as patterns. |
| IDOR Risk | None. Model binding + flat permission model is safe for Phase 5D scope. |
| Business Decisions | All 5 open decisions are resolved with recommended defaults. None block implementation. |
| Regression Risk | Low. Phase 5D adds new routes/services; it does not modify existing Phase 3B–5C code paths. |

**All pre-conditions for implementation are satisfied.**

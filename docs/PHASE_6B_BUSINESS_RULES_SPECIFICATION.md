# PHASE 6B — BUSINESS RULES SPECIFICATION
## Clinical Operations Dashboard

### 1. Executive Summary
Phase 6B specifies the operational read-only **Clinical Operations Dashboard** for the Clinical Distribution Management System (CDMS). The dashboard provides authorized clinical department administrators, directors, and coordinators with real-time operational visibility into student distribution coverage, site capacity utilization, department roster summaries, supervisor workloads, and active clinical alerts. 

The dashboard operates strictly on top of the authoritative **Current Published Distribution Architecture** (`CurrentDistributionResolver`), ensuring that draft, suggested, manual, and historical superseded versions are completely isolated and never leak into operational KPIs.

---

### 2. Audit Scope

The specification audit inspected the following repository artifacts:

*   **Models:** `DistributionVersion.php`, `StudentClinicalAssignment.php`, `Rotation.php`, `RotationBlock.php`, `Student.php`, `Person.php`, `Department.php`, `TrainingSite.php`, `SiteCapacityRule.php`, `AuditLog.php`, `User.php`.
*   **Services:** `CurrentDistributionResolver.php`, `DistributionStateValidator.php`, `DistributionValidationService.php`, `DistributionPublicationService.php`, `SupervisorReassignmentService.php`, `ClinicalScheduleQueryService.php`, `OperationalReportService.php`, `TrainingSiteRosterService.php`.
*   **Controllers:** `OperationalDistributionController.php`, `OperationalReportController.php`, `TrainingSiteRosterController.php`, `DepartmentRosterController.php`, `SupervisorController.php`.
*   **Routes & Seeders:** `routes/api.php`, `PermissionSeeder.php`, `RolePermissionSeeder.php`.
*   **Frontend SPA:** `App.tsx`, `Sidebar.tsx`, `distribution.ts`, `ReportsDashboard.tsx`, `ClinicalSchedule.tsx`.
*   **Test Suites:** Phase 3B through Phase 6A test files ($204$ backend tests, $30$ frontend tests).

---

### 3. Preserved Domain Architecture

The dashboard MUST reuse existing, approved domain services and models without duplicating or altering business rules:

```
[ CurrentDistributionResolver ]
             │
             ▼
[ DistributionVersion (is_current = true AND status = 'published') ]
             │
             ▼
[ StudentClinicalAssignment Query Engine ]
             │
             ├──► Student Coverage Aggregations
             ├──► Department Distribution Aggregations
             ├──► Training Site Capacity Rules (site_capacity_rules)
             ├──► Supervisor Workload Counts (people.max_students)
             └──► Operational Alert Summaries
```

*   **Zero Logic Duplication:** The dashboard queries assignments strictly linked to `distribution_versions.is_current = true`.
*   **Immutable Rules:** No modifications to backtracking solver, state validation, publication semantics, or placement immutability.

---

### 4. Current Distribution Isolation

The dashboard MUST enforce current published distribution isolation at the database level:

$$\text{Dashboard Version} = \{ v \in \text{DistributionVersion} \mid v.\text{status} = \text{'published'} \land v.\text{is\_current} = \text{true} \}$$

**Isolation Matrix:**
*   `suggested` versions: **EXCLUDED**
*   `manual` versions: **EXCLUDED**
*   `draft` versions: **EXCLUDED**
*   Superseded published versions (`is_current = false`): **EXCLUDED**
*   Current published versions (`status = 'published'`, `is_current = true`): **INCLUDED**

---

### 5. Dashboard KPI Specification

The dashboard metrics are defined by the following authoritative mathematical formulas and data sources:

#### A. Student Coverage Metrics
*   **Total Active Cohort Students ($N_{\text{total}}$):** Count of active students enrolled in the academic year/rotation cohort.
*   **Assigned Students ($N_{\text{assigned}}$):** Count of unique active students with at least one assignment in the current published distribution.
*   **Unassigned Students ($N_{\text{unassigned}}$):** $N_{\text{total}} - N_{\text{assigned}}$ (Calculated via `DistributionApprovalService::getUnassignedStudentIds()`).
*   **Coverage Percentage ($P_{\text{coverage}}$):**
    $$P_{\text{coverage}} = \begin{cases} \text{round}\left(\frac{N_{\text{assigned}}}{N_{\text{total}}} \times 100, 1\right) & \text{if } N_{\text{total}} > 0 \\ 0.0\% & \text{if } N_{\text{total}} = 0 \end{cases}$$

#### B. Distribution Overview Metrics
*   **Active Published Rotations:** Count of distinct rotations with an active `is_current = true` published version.
*   **Active Rotation Blocks:** Count of rotation blocks linked to currently published distributions.
*   **Total Placements Count:** Total row count of `student_clinical_assignments` under current published versions.

#### C. Department Distribution Metrics
*   **Active Departments Count:** Count of distinct departments assigned in current published version.
*   **Assignments per Department:** Count of assignments grouped by `department_id`.
*   **Department Share Percentage:**
    $$P_{\text{dept}} = \text{round}\left(\frac{\text{Assignments}_{\text{dept}}}{\text{Total Placements}} \times 100, 1\right)$$

#### D. Training Site Capacity Utilization
*   **Active Training Sites Count:** Count of distinct training sites assigned in current published version.
*   **Site Assignments:** Count of assignments grouped by `training_site_id`.
*   **Site Capacity Limit:** `site_capacity_rules.max_students` (keyed by `site_id` and `rotation_id`).
*   **Site Utilization Percentage:**
    $$P_{\text{site}} = \text{round}\left(\frac{\text{Assigned}_{\text{site}}}{\text{MaxCapacity}_{\text{site}}} \times 100, 1\right)$$

#### E. Supervisor Workload Metrics
*   **Active Supervisors Count:** Count of distinct supervisors (`supervisor_id`) assigned in current published version.
*   **Supervisor Assignments:** Count of assignments grouped by `supervisor_id`.
*   **Workload Warning Flag:** `true` if $\text{Assigned}_{\text{sup}} \ge \text{person.max\_students}$ (Soft operational warning).

#### F. Operational Alerts Summary
1.  `unassigned_students_count`: Count of active cohort students missing clinical placement.
2.  `sites_near_capacity_count`: Count of sites with utilization $P_{\text{site}} \ge 75.0\%$ and $\le 100.0\%$.
3.  `sites_over_capacity_count`: Count of sites with $\text{Assigned}_{\text{site}} > \text{MaxCapacity}_{\text{site}}$.
4.  `unsupervised_assignments_count`: Count of published assignments where `supervisor_id IS NULL`.
5.  `inactive_supervisor_assignments_count`: Count of assignments linked to `people.is_active = false`.

---

### 6. Capacity Utilization Threshold Rules

Following the verified Phase 5D conventions (`TrainingSiteRosterService`), site capacity status is categorized as:

| Utilization Status | Mathematical Condition | UI Visual Indicator |
| :--- | :--- | :--- |
| `AVAILABLE` | $0 \le P_{\text{site}} < 75.0\%$ | Green Badge |
| `NEAR_CAPACITY` | $75.0\% \le P_{\text{site}} < 100.0\%$ | Yellow/Amber Badge |
| `FULL` | $P_{\text{site}} = 100.0\%$ | Blue Badge |
| `OVER_CAPACITY` | $P_{\text{site}} > 100.0\%$ | Red Warning Badge |
| `NO_RULE` | `site_capacity_rules` record missing | Neutral Gray Badge |
| `NO_CAPACITY` | `max_students = 0` | Slate Gray Badge |

*Authoritative Source:* `site_capacity_rules.max_students` is the single source of truth. Legacy `training_sites.max_students_per_period` is obsolete and MUST NOT be used.

---

### 7. Filter Specification

The dashboard supports optional server-side filters:

| Filter Parameter | Type | Validation / Constraints | Default Behavior |
| :--- | :--- | :--- | :--- |
| `academic_year_id` | Integer | `exists:academic_years,id` | Nullable (Defaults to active academic year) |
| `rotation_id` | Integer | `exists:rotations,id` | Nullable (All active rotations) |
| `rotation_block_id`| Integer | `exists:rotation_blocks,id` | Nullable (All blocks in rotation) |
| `department_id` | Integer | `exists:departments,id` | Nullable (All departments) |
| `training_site_id` | Integer | `exists:training_sites,id` | Nullable (All training sites) |
| `supervisor_id` | Integer | `exists:people,id` | Nullable (All supervisors) |
| `academic_level` | String | `in:third,fourth,fifth,sixth` | Nullable (All levels) |

---

### 8. API Contract Specification

#### Endpoint
`GET /api/v1/operational/dashboard/summary`

#### Middleware
`auth:sanctum`, `permission:distribution.view`, `throttle:operational-read`

#### Example Response Payload (HTTP 200 OK)
```json
{
  "success": true,
  "message": "Operational dashboard summary retrieved successfully.",
  "data": {
    "student_coverage": {
      "total_active_students": 450,
      "assigned_students": 442,
      "unassigned_students": 8,
      "coverage_percentage": 98.2
    },
    "distribution_overview": {
      "active_rotations_count": 4,
      "active_blocks_count": 16,
      "total_placements_count": 884,
      "published_at": "2026-08-14T20:30:00Z"
    },
    "alerts": {
      "unassigned_students_count": 8,
      "sites_near_capacity_count": 2,
      "sites_over_capacity_count": 1,
      "unsupervised_assignments_count": 12,
      "inactive_supervisor_assignments_count": 0
    },
    "department_distribution": [
      {
        "department_id": 1,
        "name_ar": "قسم الباطني",
        "name_en": "Internal Medicine",
        "assigned_count": 320,
        "share_percentage": 36.2
      }
    ],
    "site_capacity_utilization": [
      {
        "site_id": 1,
        "name_ar": "مستشفى الخليل الحكومي",
        "name_en": "Hebron Governmental Hospital",
        "capacity_limit": 100,
        "assigned_count": 92,
        "available_capacity": 8,
        "utilization_percentage": 92.0,
        "status": "NEAR_CAPACITY"
      }
    ],
    "supervisor_workload_summary": [
      {
        "supervisor_id": 5,
        "full_name_ar": "د. أحمد محمود",
        "full_name_en": "Dr. Ahmad Mahmoud",
        "assigned_count": 5,
        "max_students": 5,
        "workload_warning": true
      }
    ]
  },
  "meta": {
    "generated_at": "2026-08-15T18:35:00Z"
  }
}
```

#### HTTP Response Statuses
*   `200 OK`: Successful retrieval.
*   `401 Unauthorized`: Unauthenticated request.
*   `403 Forbidden`: Missing `distribution.view` permission.
*   `422 Unprocessable Content`: Invalid filter parameters.

---

### 9. Security & RBAC

*   **Authentication:** Sanctum stateful session / bearer token.
*   **Authorization:** `permission:distribution.view` strictly required.
*   **IDOR & Isolation:** Queries scope strictly through `CurrentDistributionResolver` (`is_current = true` AND `status = 'published'`). Request parameters cannot expose unpublished versions or unrelated data.

---

### 10. Performance Requirements

*   **Query Count Boundary:** The dashboard endpoint MUST execute $\le 15$ SQL queries per request using SQL aggregate functions (`COUNT()`, `GROUP BY`, `selectRaw()`).
*   **N+1 Protection:** Eager-load all relationships and avoid iterating in PHP to execute individual database queries.
*   **Response Time Target:** $< 250\text{ ms}$ for typical cohorts (up to 1,000 students).

---

### 11. Frontend Specification (`ClinicalDashboard.tsx`)

#### Structure & Layout
1.  **Header Bar:** Title ("Clinical Operations Dashboard"), bilingual toggle, Filter Bar (`Academic Year`, `Rotation`, `Department`, `Site`), Manual Refresh button (`Last updated: ...`).
2.  **KPI Stat Cards (4 Cards Grid):**
    *   *Total Coverage:* $N_{\text{assigned}} / N_{\text{total}}$ ($P_{\text{coverage}}\%$ badge).
    *   *Active Rotations:* $N_{\text{rotations}}$ active published distributions.
    *   *Capacity Alerts:* Near / Over capacity site counts.
    *   *Unassigned Students:* $N_{\text{unassigned}}$ count with quick link to Unassigned Report.
3.  **Alert Banners:** Conditional warning banners for unassigned students or over-capacity sites.
4.  **Two-Column Summary Grid:**
    *   *Column 1: Training Site Capacity Table:* Site name, Limit, Assigned, Utilization %, Status Badge.
    *   *Column 2: Department Share & Supervisor Workload:* Department bar progress, Supervisor workload warnings.

#### Design Language
*   Calm, clean, professional, light theme using TailwindCSS slate palette (`bg-slate-50`, `border-slate-200`, `text-slate-900`). Responsive on desktop and tablet views. Zero decorative animations.

---

### 12. Data Visualization Requirements

*   **Lightweight UI Components:** Standard HTML5/TailwindCSS progress bars (`<div className="bg-emerald-500 h-2 rounded" style={{ width: `${pct}%` }} />`) and status badges (`NEAR_CAPACITY`, `OVER_CAPACITY`).
*   **No Heavy External Dependencies:** Avoid complex canvas chart libraries to keep bundle light and zero-dependency.

---

### 13. Refresh & Data Currency Rules

*   **On-Demand Fetching:** Fetch on mount via `@tanstack/react-query` (`useQuery(['dashboard-summary', filters])`).
*   **Manual Refresh:** Explicit "Refresh Data" button. Zero automatic background polling to minimize server load.

---

### 14. Audit Requirements

Accessing the read-only dashboard does NOT generate audit log entries (preserving `audit_logs` write efficiency). Dashboard metrics reflect existing audit events (`version.published`, `supervisor.reassigned`).

---

### 15. Database Impact

```
DATABASE CHANGES: NONE
```
No schema migrations, new tables, or column modifications are required. All queries utilize existing indexes on `student_clinical_assignments`, `distribution_versions`, `site_capacity_rules`, and `people`.

---

### 16. Test Strategy

#### Backend Test Suite (`tests/Feature/Phase6B/Phase6BTest.php`)
*   `test_unauthenticated_user_cannot_access_dashboard()`
*   `test_unauthorized_user_cannot_access_dashboard()`
*   `test_authorized_user_can_access_dashboard_summary()`
*   `test_dashboard_exclusively_uses_current_published_distribution()`
*   `test_dashboard_excludes_suggested_manual_and_historical_versions()`
*   `test_student_coverage_percentage_calculation_handles_zero_students()`
*   `test_site_capacity_utilization_thresholds()`
*   `test_dashboard_filters_apply_correctly()`
*   `test_dashboard_query_count_does_not_exceed_limit()` (N+1 protection)

#### Frontend Test Suite (`src/pages/ClinicalDashboard.test.tsx`)
*   Renders KPI cards, capacity tables, and supervisor alerts.
*   Handles loading, empty, and API error states gracefully.

---

### 17. Definition of Done

Phase 6B is ready for implementation approval because:
1. [x] All KPI formulas and data sources are explicitly defined.
2. [x] `CurrentDistributionResolver` is established as the sole authoritative currency source.
3. [x] Zero duplicate business logic is introduced.
4. [x] API contract (`GET /api/v1/operational/dashboard/summary`) is fully defined.
5. [x] Security and RBAC model (`permission:distribution.view`) is verified.
6. [x] Filter specification is defined.
7. [x] Capacity threshold rules (`75% NEAR_CAPACITY`) are documented.
8. [x] Performance requirements ($\le 15$ queries, $O(1)$) are measurable.
9. [x] Test plan (Backend + Frontend) is complete.
10. [x] Frontend `ClinicalDashboard.tsx` layout and UX requirements are complete.
11. [x] Database impact is explicitly confirmed (`NONE`).

---

### 18. Open Business Decisions

*No open business decisions remain.* All rules, thresholds, and calculations are strictly derived from verified repository baselines (Phase 5A through Phase 6A).

---

### 19. Recommended Implementation Sequence

```
Phase 6B-1: Service & DTO Query Layer (OperationalDashboardService.php & DashboardSummaryDTO.php)
     │
     ▼
Phase 6B-2: API Controller & Route Registration (OperationalDashboardController.php & api.php)
     │
     ▼
Phase 6B-3: Security & Performance Benchmarking (N+1 query assertions & rate limiting)
     │
     ▼
Phase 6B-4: Frontend SPA Implementation (ClinicalDashboard.tsx, distribution.ts, App.tsx, Sidebar.tsx)
     │
     ▼
Phase 6B-5: Automated Test Suite (Phase6BTest.php & ClinicalDashboard.test.tsx)
     │
     ▼
Phase 6B-6: Final Regression Verification & Implementation Report
```

---

### 20. Final Readiness Verdict

# READY FOR PHASE 6B IMPLEMENTATION

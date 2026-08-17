# PHASE 6 — PRE-IMPLEMENTATION AUDIT & BUSINESS RULES SPECIFICATION
## Production Readiness, Clinical Operations Dashboard, Event Architecture, & Security Certification

### 1. Executive Summary
Phase 6 evaluates the Clinical Distribution Management System (CDMS) for production deployment readiness. The system has completed Phases 3B through 5F with 198 backend tests (607 assertions), 30 frontend tests, and 0 TypeScript errors. This specification establishes the comprehensive audit findings, operational workflow mappings, production security controls, performance scaling targets, event architecture, clinical operations dashboard requirements, and business decision register required before executing Phase 6 sub-phases.

---

### 2. Repository Audit Scope
The audit inspected the complete codebase baseline across:
*   **Backend Services & Controllers:** `CurrentDistributionResolver`, `DistributionStateValidator`, `DistributionPublicationService`, `DistributionApprovalService`, `SupervisorReassignmentService`, `ClinicalScheduleQueryService`, `OperationalReportService`, `OperationalDistributionController`, `OperationalReportController`.
*   **Database Schema & Migrations:** 28 migration files covering users, roles, permissions, academic years, rotations, rotation blocks, departments, training sites, people, capacity rules, distribution versions, assignments, conflicts, and audit logs.
*   **Frontend SPA:** React 19 + TypeScript + Vite architecture using `@tanstack/react-query`, `react-router-dom`, `react-hook-form`, `zod`, and TailwindCSS.
*   **Infrastructure Configuration:** `.env.example`, `config/cors.php`, `config/sanctum.php`, `config/logging.php`, `bootstrap/app.php`.

---

### 3. Existing Architecture
```
[ Frontend SPA (React 19 + TypeScript) ]
                  │
                  ▼
[ Sanctum SPA Cookie Auth / Bearer API ]
                  │
                  ▼
[ Operational API Controllers (V1) ] ──► [ EnsurePermission Middleware ]
                  │
                  ▼
[ Domain Services & Resolvers ] ──► [ CurrentDistributionResolver ]
                  │                                  │
                  ▼                                  ▼
[ DB Transaction & Pessimistic Locks ] ──► [ MySQL 8.x (is_current = 1) ]
                  │
                  ▼
[ Audit Log & Export Engine ] ──► [ Excel / CSV (BOM) / PDF (Landscape) ]
```

---

### 4. Production Readiness Audit

| Category | Item | Current State | Risk Level | Required Production Baseline |
| :--- | :--- | :--- | :--- | :--- |
| **Config** | `APP_ENV` / `APP_DEBUG` | `local` / `true` in `.env.example` | **HIGH** | Set `APP_ENV=production` and `APP_DEBUG=false`. |
| **Config** | Secrets / App Key | Blank template | **CRITICAL** | Enforce strong `APP_KEY` generation via `php artisan key:generate`. |
| **Auth** | Sanctum Stateful Domains | `localhost:5173` | **MEDIUM** | Configure production FQDN (e.g. `cdms.hebron.edu`). |
| **Auth** | Session Security | `SESSION_SECURE_COOKIE=false` | **HIGH** | Set `SESSION_SECURE_COOKIE=true` for HTTPS deployment. |
| **CORS** | Allowed Origins | `FRONTEND_URLS=http://localhost:5173` | **HIGH** | Restrict to strict production origin scheme without wildcards. |
| **Logging** | Channel & Rotation | `LOG_STACK=daily` (14 days) | **MEDIUM** | Configure centralized log rotation (Syslog / CloudWatch / Monolog). |
| **Errors** | API Exception Envelope | `bootstrap/app.php` `ApiResponse::error()` | **LOW** (Pass) | Standardized envelope active; masks traces when `APP_DEBUG=false`. |
| **Queue** | Driver | `QUEUE_CONNECTION=sync` | **HIGH** | Upgrade to `database` or `redis` queue driver for async workers. |
| **Cache** | Driver | `CACHE_STORE=database` | **LOW** (Pass) | Database-backed cache is active and production-ready. |
| **Health** | Health Check Endpoint | `/up` active in `bootstrap/app.php` | **LOW** (Pass) | Standard Laravel health probe ready for load balancer. |
| **Rate Limit**| Throttle Middleware | Not applied on API endpoints | **HIGH** | Apply `throttle:60,1` rate limiting to API routes. |

---

### 5. Clinical Operational Workflow Audit

The 24 core clinical operational workflows are mapped below:

1.  **Academic Year Setup:** Actor: Admin. Action: Define start/end dates. Validation: No overlapping years. Audit: `academic_year.created`. Reversible: Yes.
2.  **Student Cohort Import/Prep:** Actor: Admin. Action: Create/assign student groups & subgroups. Validation: Unique university number. Audit: `student.created`. Reversible: Yes.
3.  **Rotation Creation:** Actor: Admin. Action: Define academic level and dates. Validation: Start date $\le$ End date. Audit: `rotation.created`. Reversible: Yes.
4.  **Rotation Block Setup:** Actor: Admin. Action: Define block week bounds (`from_week`, `to_week`). Validation: Non-overlapping block weeks. Audit: `block.created`. Reversible: Yes.
5.  **Training Site Management:** Actor: Admin. Action: Define sites and capacity rules. Validation: Capacity $\ge 0$. Audit: `site.created`. Reversible: Yes.
6.  **Department Association:** Actor: Admin. Action: Link departments to rotations/blocks. Validation: Valid department ID. Audit: `department.linked`. Reversible: Yes.
7.  **Supervisor Registration:** Actor: Admin. Action: Register supervisor `Person` record with `max_students`. Validation: Valid `max_students` limit. Audit: `supervisor.created`. Reversible: Yes.
8.  **Site Capacity Rule Definition:** Actor: Admin. Action: Set `site_capacity_rules.max_students`. Validation: Unique `(rotation_id, site_id)`. Audit: `capacity_rule.created`. Reversible: Yes.
9.  **Distribution Generation:** Actor: Admin. Action: Run backtracking solver (Phase 3B). Validation: Hard capacity & conflict constraints. Result: Draft `suggested` version created. Audit: `version.generated`. Reversible: Yes (version deletion).
10. **Manual Adjustment:** Actor: Admin. Action: Modify placement (`DistributionManualAssignmentService`). Validation: Real-time constraint check. Result: Status becomes `manual`. Audit: `assignment.created`/`deleted`. Reversible: Yes.
11. **Distribution Validation:** Actor: Admin/Director. Action: Execute `DistributionStateValidator`. Validation: Checks hard/soft constraints and unassigned students. Audit: None (Read). Reversible: N/A.
12. **Distribution Approval:** Actor: Director. Action: Approve version via `DistributionApprovalService`. Validation: Generates SHA256 approval fingerprint. Audit: `version.approved`. Reversible: Yes (revoked on edit).
13. **Distribution Publication:** Actor: Director. Action: Publish version via `DistributionPublicationService`. Validation: Transactional update setting `is_current = true` and demoting old current version. Audit: `version.published`. Reversible: No (superseded by new version).
14. **Student Schedule Access:** Actor: Student. Action: View individual clinical schedule. Scope: Authoritative current published distribution. Validation: Sanctum auth. Audit: None (Read). Reversible: N/A.
15. **Supervisor Portal Access:** Actor: Supervisor. Action: View assigned students. Scope: Authoritative current published distribution. Validation: Linked `person_id`. Audit: None (Read). Reversible: N/A.
16. **Department Roster Access:** Actor: Department Staff. Action: View department student roster. Scope: Authoritative current published distribution. Validation: `permission:distribution.view`. Audit: None (Read). Reversible: N/A.
17. **Training Site Roster Access:** Actor: Site Admin. Action: View site capacity utilization. Scope: Authoritative current published distribution. Validation: `permission:distribution.view`. Audit: None (Read). Reversible: N/A.
18. **Unassigned Student Tracking:** Actor: Admin. Action: View active cohort students without placement. Scope: Authoritative current published distribution. Audit: None (Read). Reversible: N/A.
19. **Post-Publication Supervisor Reassignment:** Actor: Admin. Action: Update `supervisor_id` on published assignment. Validation: Placement is immutable (only supervisor ID changes). Inactive supervisors rejected. Audit: `supervisor.reassigned`. Reversible: Yes (reassign again).
20. **Operational Reporting:** Actor: Staff. Action: Generate Master/Department/Site/Supervisor reports. Scope: Current published distribution. Audit: None (Read). Reversible: N/A.
21. **Export Generation:** Actor: Staff. Action: Stream Excel (.xlsx), CSV (UTF-8 BOM), or PDF (Landscape). Scope: Current published distribution. Audit: None (Read). Reversible: N/A.
22. **Version Supersession:** Actor: System. Action: Demote old current published version (`is_current = false`) when new version publishes. Audit: `version.superseded`. Reversible: No.
23. **Post-Publication Correction:** Actor: Admin. Action: Generate new distribution version to fix operational errors. Validation: Full approval/publication pipeline. Audit: `version.published`. Reversible: No.
24. **Historical Audit Inspection:** Actor: Auditor. Action: Query immutable `audit_logs` history. Scope: All lifecycle events. Audit: None (Read). Reversible: N/A.

---

### 6. Business Rules Specification

1.  **Academic Year & Rotation Isolation:** Each rotation is linked to exactly one academic year. Rotations MUST NOT share blocks across academic years.
2.  **Current Published Currency Rule:**
    $$\text{Operational State} = \{ \text{version} \mid \text{version.status} = \text{'published'} \land \text{version.is\_current} = \text{true} \}$$
    Only ONE version per rotation can have `is_current = true` at any point in time.
3.  **Placement Immutability:** Once a distribution version is published, the student's assigned rotation block, department, and training site ARE IMMUTABLE. Post-publication operational adjustments permit ONLY supervisor reassignment (`supervisor_id`). Structural changes require publishing a new version.
4.  **Capacity Source of Truth:** Training site capacity is governed strictly by `site_capacity_rules.max_students`. Over-capacity triggers warning status `OVER_CAPACITY`. 75% utilization triggers `NEAR_CAPACITY`.
5.  **Supervisor Workload Rule:** Supervisor `max_students` limit violation triggers a soft warning in summaries and UI cards but MUST NOT block post-publication supervisor reassignment or report generation.
6.  **Unassigned Student Rule:** Active cohort students missing placement in the current published version are flagged as `Unassigned`. Inactive students or students assigned in the current published version MUST NOT appear as unassigned.
7.  **Idempotency Rule:** Re-executing approval or publication on an unchanged version MUST return the existing state without creating duplicate audit logs.

---

### 7. Security & Authorization Audit

*   **Authentication:** Sanctum stateful cookie authentication for SPA; token authentication for API requests.
*   **Authorization (RBAC):** Middleware `permission:distribution.view|create|update|delete|approve|publish|override` strictly enforced.
*   **Object-Level Authorization (IDOR):** Scoped queries prevent cross-tenant/cross-rotation data access.
*   **Parameter Tampering:** All request inputs sanitised via Laravel FormRequests and Typehints. Raw SQL construction is prohibited.

---

### 8. Performance & Scalability Scaling Bounds

| Cohort Size | DB Query Count | Execution Time Target | Memory Target | Scaling Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **100 Students** | $\le 25$ queries | $< 100\text{ ms}$ | $< 15\text{ MB}$ | Standard Eager Loading |
| **500 Students** | $\le 25$ queries | $< 250\text{ ms}$ | $< 20\text{ MB}$ | Standard Eager Loading |
| **1,000 Students** | $\le 25$ queries | $< 400\text{ ms}$ | $< 30\text{ MB}$ | Paginated & Streamed (`FromQuery`) |
| **5,000 Students** | $\le 30$ queries | $< 1000\text{ ms}$ | $< 45\text{ MB}$ | Chunked Cursor Processing |
| **10,000 Students** | $\le 30$ queries | $< 2000\text{ ms}$ | $< 60\text{ MB}$ | Background Job / Redis Stream |

---

### 9. Data Integrity Audit

All critical tables enforce database-level relational integrity:
*   `student_clinical_assignments`: Compound unique key `(student_id, rotation_block_id, distribution_version_id)`.
*   `distribution_versions`: Foreign key `rotation_id` with cascading deletes. Indexed `(rotation_id, is_current)`.
*   `site_capacity_rules`: Foreign keys `rotation_id`, `site_id`.
*   `audit_logs`: Foreign key `user_id`, indexed `entity_id` and `action`.

---

### 10. Notification & Event Architecture

To decouple domain triggers from communication channels, CDMS will establish an internal Domain Event architecture:

```
[ Domain Service ]
        │
        ├──► emits DistributionPublishedEvent
        ├──► emits SupervisorReassignedEvent
        └──► emits ApprovalRevokedEvent
                 │
                 ▼
[ Event Bus (Laravel Event Dispatcher) ]
                 │
                 ├──► AuditLogListener (Synchronous)
                 └──► NotificationListener (Queued Async)
                          │
                          ├──► Database Notification (In-App)
                          └──► Email / SMS / WhatsApp (Future Providers)
```

**Proposed Domain Events:**
1.  `App\Events\DistributionPublishedEvent` (Version ID, Publisher ID, Rotation ID)
2.  `App\Events\SupervisorReassignedEvent` (Assignment ID, Old Supervisor ID, New Supervisor ID, Reassigned By)
3.  `App\Events\ApprovalRevokedEvent` (Version ID, Revoked By, Reason)

---

### 11. Clinical Operations Dashboard Requirements

Phase 6 will specify a read-only **Clinical Operations Dashboard** providing real-time operational visibility:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      CLINICAL OPERATIONS DASHBOARD                     │
├───────────────────┬───────────────────┬───────────────────┬────────────┤
│ Active Rotations  │ Total Students    │ Assigned Students │ Unassigned │
│       4           │      450          │      442 (98.2%)  │    8 (1.8%)│
├───────────────────┴───────────────────┴───────────────────┴────────────┤
│ ┌──────────────────────────────────┐ ┌───────────────────────────────┐ │
│ │ Site Capacity Utilization        │ │ Supervisor Workload Summary   │ │
│ │ - City Hospital: 92% (NEAR)      │ │ - Dr. Ahmad: 5/5 (FULL)       │ │
│ │ - Hebron Clinic: 105% (OVER)     │ │ - Dr. Sarah: 3/5 (NORMAL)     │ │
│ └──────────────────────────────────┘ └───────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

**Required KPI Data Contracts:**
*   `active_rotations_count`: Number of rotations with `is_current = true` distribution.
*   `total_students_cohort`: Total active students in current rotations.
*   `assigned_students_count`: Students with valid assignments in current published distribution.
*   `unassigned_students_count`: Students missing assignments in current published distribution.
*   `sites_near_capacity_count`: Sites with utilization $\ge 75\%$.
*   `sites_over_capacity_count`: Sites with assigned count $>$ capacity.

---

### 12. Backup & Disaster Recovery Requirements

*   **Database Backup Policy:** Daily automated MySQL database dumps via `spatie/laravel-backup` or cron `mysqldump`.
*   **Retention Period:** 30 daily backups, 12 monthly backups, 7 yearly backups.
*   **Storage Target:** Encrypted offsite S3-compatible cloud storage.
*   **Recovery Point Objective (RPO):** $\le 24\text{ hours}$ (daily backup) or $\le 1\text{ hour}$ if binary logging enabled.
*   **Recovery Time Objective (RTO):** $\le 2\text{ hours}$ to restore full operational service.
*   **Audit Log Preservation:** `audit_logs` table MUST NOT be truncated or purged during database maintenance.

---

### 13. UX & Usability Audit

*   **Navigation:** Clean sidebar routing for Workbench, Schedules, Department Rosters, Site Rosters, Supervisor Portal, and Reports.
*   **Feedback & Loading:** All async actions display loading spinners and clear toast alerts.
*   **Bilingual Support (i18n):** Complete English/Arabic translations via `I18nContext`.
*   **Error Display:** Standardized error banners masking internal system details.

---

### 14. Findings & Risk Register

| ID | Category | Description | Severity | Mitigation Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **RSK-01** | Production | `APP_DEBUG=true` in default `.env.example` | **HIGH** | Set `APP_DEBUG=false` in production config. |
| **RSK-02** | Security | Unrestricted API Rate Limiting | **HIGH** | Apply `throttle:60,1` middleware to API routes. |
| **RSK-03** | Auth | `SESSION_SECURE_COOKIE=false` default | **HIGH** | Set `true` in production deployment script. |
| **RSK-04** | Queue | Sync queue driver used for all tasks | **MEDIUM** | Configure database queue driver for background tasks. |
| **RSK-05** | Architecture | Lack of decoupled Domain Events | **MEDIUM** | Implement Phase 6C Event/Listener architecture. |

---

### 15. Business Decision Register

| ID | Decision | Current State | Recommended Rule | Reason | Impact | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BDR-01** | Production Debug Flag | `APP_DEBUG=true` | `APP_DEBUG=false` | Prevent stack trace leakage | Security | High | **RECOMMENDED** |
| **BDR-02** | Rate Limiting | No throttling | `throttle:60,1` | Prevent API abuse | Security | High | **RECOMMENDED** |
| **BDR-03** | Database Queue Driver | `QUEUE_CONNECTION=sync` | `database` | Async event/mail processing | Performance | Medium | **RECOMMENDED** |
| **BDR-04** | Operational Dashboard | None | Read-only KPI API + UI | Administrative visibility | Usability | Medium | **RECOMMENDED** |
| **BDR-05** | Domain Events | Direct logging | Event-driven bus | Decoupled architecture | Scalability | Medium | **RECOMMENDED** |

---

### 16. Proposed Phase 6 Implementation Sub-Phases

*   **Phase 6A: Production Readiness & Security Foundation**
    *   Configure production environment templates, rate limiting (`throttle:60,1`), HTTPS secure cookies, CORS origin validation, and database queue configuration.
*   **Phase 6B: Clinical Operations Dashboard**
    *   Implement `/api/v1/operational/dashboard/summary` endpoint returning real-time KPI metrics and build `ClinicalDashboard.tsx`.
*   **Phase 6C: Event & Notification Architecture**
    *   Implement `DistributionPublishedEvent`, `SupervisorReassignedEvent`, `ApprovalRevokedEvent`, and async queue listeners.
*   **Phase 6D: Reliability, Backup & Automated Verification**
    *   Create automated backup console command / backup verification script and finalize operational health checks.
*   **Phase 6E: Final Security, Performance & System Certification**
    *   Run complete 198+ backend test suite, 30+ frontend vitest suite, and TypeScript check for final sign-off.

---

### 17. Definition of Done
* [ ] Production configuration checklist verified (`APP_DEBUG=false`, rate limiting active, secure cookies enabled).
* [ ] Clinical Operations Dashboard API and UI implemented.
* [ ] Event/Listener architecture implemented for publication and supervisor reassignment.
* [ ] Database backup and disaster recovery procedures documented.
* [ ] Full backend test suite passes ($198+$ tests).
* [ ] Full frontend test suite passes ($30+$ tests).
* [ ] TypeScript check passes with 0 errors.

---

### 18. Open Decisions
*   **Decision 1: Production Backup Schedule & Storage Provider**
    *   *Options:* Local disk vs AWS S3 / Cloud Storage.
    *   *Recommendation:* AWS S3 or equivalent offsite S3-compatible cloud storage.

---

### 19. Final Readiness Verdict

**READY FOR PHASE 6 IMPLEMENTATION**

*The system audit confirms a robust baseline (198 backend tests, 30 frontend tests, 0 TypeScript errors), well-structured domain services, and complete readiness for Phase 6 sub-phase execution.*

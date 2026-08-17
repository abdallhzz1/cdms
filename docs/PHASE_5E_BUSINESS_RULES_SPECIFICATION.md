# PHASE 5E — PRE-IMPLEMENTATION AUDIT & BUSINESS RULES SPECIFICATION
## Operational Reports & Data Export Engine

### 1. Executive Summary
Phase 5E introduces a comprehensive operational reporting and data export engine for the Clinical Distribution Management System (CDMS). This layer will enable authorized clinical staff to generate Excel, CSV, and PDF reports based on the authoritative current published distribution. The reporting engine is strictly a read-only projection of existing business rules and will not introduce new schedule validation, capacity, or assignment logic.

### 2. Repository Audit
The following components have been audited to ensure a consistent reporting architecture:
*   **Models:** `DistributionVersion`, `StudentClinicalAssignment`, `Student`, `TrainingSite`, `Department`, `Rotation`, `RotationBlock`, `SiteCapacityRule`, `AuditLog`. All required relationships are present.
*   **Services:** `CurrentDistributionResolver`, `DepartmentRosterService`, `TrainingSiteRosterService`. The existing query architecture is robust and reusable for reporting.
*   **Controllers:** `DepartmentRosterController`, `TrainingSiteRosterController`, `OperationalDistributionController`.
*   **Database:** `site_capacity_rules` is the authoritative source for capacity. `student_clinical_assignments.department_id` is physically stored and indexed.
*   **Tests:** Phase 3B–5D tests confirm the integrity of the data being queried.

### 3. Existing Architecture
The current architecture relies on `CurrentDistributionResolver` to identify the `published` and `is_current = true` distribution version. `ClinicalScheduleQueryService`, `DepartmentRosterService`, and `TrainingSiteRosterService` already provide the foundational query logic for operational reads. The new reporting layer should sit above these services, transforming their standardized query outputs into exportable formats (Excel, CSV, PDF) rather than rewriting the database queries from scratch.

### 4. Data Sources
**The reporting engine MUST strictly use `CurrentDistributionResolver` as the authoritative source for current operational reports.**
*   Mode A (Current Operational Report): Only queries data linked to the distribution version where `status = 'published'` and `is_current = true`.
*   Mode B (Historical/Version Report): Queries data for an explicit `distribution_version_id` when specifically requested. It must never silently fallback to the current version.

### 5. Report Catalog & Business Rules

#### A. Master Clinical Distribution Report
*   **Content:** Complete schedule (Student, Univ. No, Rotation, Block, Dates, Department, Site, Supervisor, Assignment status).
*   **Rules:** Includes all assignments in the targeted version. Filterable by Academic Year, Rotation, Block, and Department. Sorts deterministically by student name and block date.

#### B. Student Clinical Schedule Report
*   **Content:** Selected student's complete rotation schedule for the academic year.
*   **Rules:** Uses the exact authoritative schedule logic as the frontend Student Schedule API.

#### C. Department Distribution Report
*   **Content:** All current assignments for a selected department.
*   **Rules:** Filters by `student_clinical_assignments.department_id`. Includes summary totals.

#### D. Training Site Roster Report
*   **Content:** All assignments at a specific site, including capacity utilization metrics.
*   **Rules:** Strictly uses `site_capacity_rules.max_students`. Displays capacity percentage and status (e.g., NEAR_CAPACITY, FULL, OVER_CAPACITY).

#### E. Supervisor Assignment Report
*   **Content:** Workload and specific student assignments for a selected supervisor.
*   **Rules:** Includes workload summary against the supervisor's `max_students` limit. Respects the supervisor reassignment architecture.

#### F. Unassigned Student Report
*   **Content:** Students missing assignments for a specific rotation/block.
*   **Rules:** Uses the same unassigned resolution logic as Phase 5B. DO NOT invent new eligibility logic.

#### G. Capacity Utilization Report
*   **Content:** Global or site-specific capacity overview.
*   **Rules:** Utilizes the NEAR_CAPACITY threshold of 75% as established in Phase 5D.

#### H. Distribution Version Report
*   **Content:** Summary statistics for a specific historical or current version (Assigned, Unassigned, Conflicts).

#### I. Version Comparison Report
*   **Content:** Delta between two versions (Added, Removed, Changed Site/Supervisor).
*   **Rules:** Reuses `DistributionVersionComparisonService` logic (Phase 4B).

#### J. Audit / Lifecycle Report
*   **Content:** Log of operational changes (manual overrides, supervisor changes, approvals, publications).
*   **Rules:** Strictly enforces RBAC; only users with explicit audit permissions may generate this.

### 6. Export Formats & Dependencies
Currently, the `composer.json` does not include specific PDF or Excel export libraries.
*   **Excel/CSV:** Recommend installing `maatwebsite/excel` (Laravel Excel) which wraps PhpSpreadsheet.
*   **PDF:** Recommend installing `barryvdh/laravel-dompdf` for standard PDF generation, as it is lightweight and handles tabular data well. (For complex/heavy PDFs, `spatie/browsershot` could be considered later).
*   **Note:** Dependencies MUST NOT be installed during Phase 5E audit. They will be installed in Phase 5E-3 and 5E-4.

### 7. Excel Export Rules
*   Headers must be frozen (Freeze Panes).
*   Auto-filter enabled on header row.
*   Dates formatted consistently (`YYYY-MM-DD`).
*   Support for UTF-8 and RTL (Right-to-Left) text for Arabic names.
*   Columns auto-sized where practical.
*   File naming convention must be professional and safe.

### 8. CSV Export Rules
*   Encoding: UTF-8 with BOM (Byte Order Mark) to ensure Excel opens Arabic text correctly by default.
*   Delimiter: Comma (`,`).
*   String enclosure: Double quotes (`"`).
*   Escaping: Embedded commas or quotes must be escaped correctly.

### 9. PDF Report Rules
*   Official Header: University logo, Clinical Department identity.
*   Metadata: Generation timestamp, filters applied, current academic year.
*   Orientation: Master, Department, and Site rosters typically require Landscape due to column count. Student and Summary reports can be Portrait.
*   Support for Arabic (RTL) via appropriate fonts (e.g., `dejavusans` or a custom Arabic font like Cairo) in the PDF engine.
*   Pagination: Proper page numbering (Page X of Y) and repeating headers on page breaks.

### 10. Filtering Model
Consistent query parameters across endpoints:
*   `academic_year_id`
*   `rotation_id`
*   `rotation_block_id`
*   `department_id`
*   `training_site_id`
*   `supervisor_id`
*   `student_id`

### 11. Permissions & RBAC
*   Existing `permission:distribution.view` is sufficient for standard operational reports (Master, Department, Site, Supervisor).
*   **Recommendation:** Create a new `permission:distribution.audit` for generating the Audit/Lifecycle report, as this exposes sensitive system data.
*   **Recommendation:** A generalized `permission:distribution.export` could be introduced if the institution requires separating view access from download access.

### 12. Security
*   All endpoints must enforce `auth:sanctum` and appropriate permissions.
*   No raw IDs should be exposed if they pose a security risk (though standard incremental IDs are generally acceptable in this internal administrative system).
*   File downloads must be authenticated (no public URLs).
*   Data isolation boundaries MUST be respected.

### 13. Performance Requirements (Crucial)
*   The system MUST NOT introduce N+1 queries. Eager loading (`with(['student', 'rotationBlock', 'trainingSite', 'department', 'supervisor'])`) must be rigorously applied.
*   For large datasets, the export engine should utilize chunking (e.g., `chunk(500)`) or lazy collections (`cursor()`) to stream data to CSV/Excel rather than loading thousands of Eloquent models into RAM simultaneously.
*   Database-level filtering and aggregation must be preferred over PHP-side iteration.

### 14. Large Export Strategy
*   **Synchronous Threshold:** Reports expected to return < 1000 rows can be generated synchronously in the HTTP request.
*   **Asynchronous Threshold:** If a report exceeds 1000 rows (or if performance profiling dictates), the system should pivot to queuing a job, generating the file, and notifying the user.
*   *Recommendation:* For Phase 5E implementation, synchronous generation using `cursor()`/streaming is sufficient for the current scale, but the architecture must allow easy migration to Queued Exports.

### 15. File Security
If files are saved temporarily for download:
*   Stored in `storage/app/exports` (not `public`).
*   Filenames use random UUIDs internally to prevent enumeration.
*   A scheduled command (e.g., `php artisan schedule:run`) deletes exported files older than 24 hours.
*   Controller streams the file response: `return response()->download($path);` with proper authorization checks.
*   Prevention of path traversal by stripping directory slashes from user inputs.

### 16. Report Consistency
*   Exports represent a snapshot at the exact millisecond of generation.
*   The generation timestamp and active `distribution_version_id` must be stamped into the report metadata (e.g., PDF header or Excel metadata sheet) to prevent confusion if a publication occurs during or immediately after export.

### 17. Report Naming Convention
Format: `[report_type]_[entity_name]_[academic_year]_[timestamp].[ext]`
Examples:
*   `department_roster_internal_medicine_2026_2027_1692100000.xlsx`
*   `training_site_roster_alahli_2026_2027_1692100000.pdf`

### 18. Frontend Reporting UX
*   **Route:** `/operational/reports`
*   **UI Elements:**
    *   Left panel: Report Type selector (Master, Department, Site, etc.).
    *   Main panel: Contextual filters (Select Department, Select Rotation, Version selection).
    *   Action area: "Export to Excel", "Export to CSV", "Export to PDF" buttons.
    *   Feedback: Loading spinners during generation, error toasts for failures, empty states.

### 19. API Design
*   `GET /api/v1/operational/reports/master` (Query params for format: `?format=excel`, `?format=csv`, `?format=pdf`)
*   `GET /api/v1/operational/reports/departments/{department}`
*   `GET /api/v1/operational/reports/training-sites/{trainingSite}`
*   `GET /api/v1/operational/reports/supervisors/{supervisor}`
*   *Returns:* A binary file stream (e.g., `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` or `application/pdf`) via chunked streaming response.

### 20. Error Handling
*   `400 Bad Request`: Invalid report type or unsupported format.
*   `404 Not Found`: Entity (e.g., department) not found.
*   `422 Unprocessable Entity`: Invalid filter parameters.
*   `403 Forbidden`: Lacks export permission or audit permission.
*   `409 Conflict`: No current published distribution exists for the filtered criteria.

### 21. Testing Strategy
*   Feature Tests (`tests/Feature/Phase5E/ExportTest.php`):
    *   `authorized_user_can_export_department_excel`
    *   `exported_excel_contains_correct_headers`
    *   `csv_export_includes_utf8_bom`
    *   `pdf_export_returns_valid_pdf_stream`
    *   `unauthorized_user_cannot_export_reports`
    *   `export_uses_chunking_and_prevents_n_plus_one` (Query count assertion).
    *   `historical_version_reports_do_not_default_to_current`
*   Performance regression testing ensuring linear memory usage for 1,000+ assignment exports.

### 22. Open Business Decisions
1. **Decision:** Export Generation Library.
   *   *Options:* Native PHP CSV writing vs `maatwebsite/excel`.
   *   *Recommended:* `maatwebsite/excel`. It handles Excel, CSV, and chunking elegantly within Laravel.
2. **Decision:** PDF Engine.
   *   *Options:* `dompdf` vs `browsershot`.
   *   *Recommended:* `dompdf`. Easier to configure, no Node.js/Puppeteer server requirements. Good enough for standard tabular rosters.
3. **Decision:** Async vs Sync Generation.
   *   *Recommended:* Synchronous using `Cursor` / `FromQuery` (Laravel Excel feature) for immediate download. The dataset sizes (typically a few hundred rows per department/site) will comfortably generate synchronously. No complex queue architecture needed for v1.

### 23. Recommended Implementation Sequence
*   **Phase 5E-1:** Install Dependencies (`maatwebsite/excel`, `barryvdh/laravel-dompdf`).
*   **Phase 5E-2:** Create `OperationalReportService` and Data Transfer/Export classes.
*   **Phase 5E-3:** Implement Excel & CSV generation endpoints.
*   **Phase 5E-4:** Implement PDF generation and views.
*   **Phase 5E-5:** Write Backend Tests (including N+1 regression).
*   **Phase 5E-6:** Frontend Reports UI (`/operational/reports`).
*   **Phase 5E-7:** Final Integration and Regression Hardening.

### 24. Definition of Done
* [ ] Reports exclusively use authoritative published data via `CurrentDistributionResolver`.
* [ ] `maatwebsite/excel` and `dompdf` integrated securely.
* [ ] Excel, CSV (with BOM), and PDF exports function correctly.
* [ ] Zero N+1 queries during export generation.
* [ ] RBAC enforced on all export endpoints.
* [ ] No modification or duplication of capacity or assignment logic.
* [ ] Frontend UI provides an intuitive report selection interface.
* [ ] Comprehensive test suite confirms data accuracy and security.

### 25. Final Readiness Verdict
**READY FOR IMPLEMENTATION**
The underlying architecture (CurrentResolver, Queries, DTOs, Capacity Rules) is completely stable, battle-tested in prior phases, and perfectly suited to support a lightweight export projection layer.

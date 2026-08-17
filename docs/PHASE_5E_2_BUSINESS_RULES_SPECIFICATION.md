# PHASE 5E-2 — EXPORT VERIFICATION & REPORT QUALITY HARDENING
## Business Rules Specification & Audit Report

### 1. Executive Summary
Phase 5E-2 defines the rigorous verification, quality hardening, and operational integrity standards for the Clinical Distribution Management System (CDMS) Operational Reports & Data Export Engine. While Phase 5E-1 successfully established Excel, CSV, and PDF exports backed by passing test suites (186 backend tests, 30 frontend tests), Phase 5E-2 establishes the exact business rules, cross-format data contract parity, filter integrity, Unicode/Arabic formatting constraints, and security boundaries required before proceeding to Phase 5F.

### 2. Scope
This document covers:
*   Authoritative distribution selection rules for all report types.
*   Strict cross-format (Excel / CSV / PDF) data contract parity.
*   Filter parity rules between UI, REST API, and file exports.
*   Handling of empty datasets and null relationships.
*   Capacity utilization formula standardization (`site_capacity_rules.max_students`).
*   Arabic/Unicode text rendering rules (UTF-8 BOM for CSV, RTL font configuration for PDF).
*   Security, RBAC, and data isolation rules.
*   Performance and N+1 query regression thresholds.
*   Comprehensive test matrix and recommended implementation sequence for Phase 5E-2.

---

### 3. Repository Audit

#### Audit Summary & Baseline Findings
The repository audit verified the following baseline state across key system components:

1.  **Backend Services & Controllers:**
    *   `OperationalReportController`: Successfully routes export requests and validates `rotation_id`.
    *   `OperationalReportService`: Resolves versions via `CurrentDistributionResolver` and eager-loads relationships (`student`, `rotationBlock`, `trainingSite`, `department`, `supervisor`).
    *   `CurrentDistributionResolver`: Properly checks `status = 'published'` AND `is_current = true`.

2.  **Export & Template Architecture:**
    *   `DistributionReportExport`: Uses `FromQuery`, `WithHeadings`, `WithMapping`, `ShouldAutoSize`.
    *   `GenericArrayExport`: Uses `FromArray`, `WithHeadings`, `ShouldAutoSize`.
    *   Blade Templates (`distribution_roster`, `training_site_capacity`, `unassigned_students`): Utilize DomPDF with `DejaVu Sans` font.

3.  **Identified Gaps & Quality Hardening Opportunities:**
    *   **Data Contract Discrepancy:** The Excel export maps English (`full_name_en`) and Arabic (`full_name_ar`) names as separate columns, whereas the PDF template only displays Arabic names (`full_name_ar`).
    *   **CSV Encoding:** CSV output currently streams UTF-8 strings without an explicit Byte Order Mark (BOM). Microsoft Excel on Windows requires a UTF-8 BOM (`\xEF\xBB\xBF`) to auto-detect Arabic encoding without user prompt.
    *   **Filter Parity:** In `trainingSiteCapacity` and `unassignedStudents`, optional filters passed in query parameters (such as `rotation_block_id` or `department_id`) are not currently passed down into the array aggregation logic.

---

### 4. Existing Architecture
The reporting layer acts as a strict read-only projection above existing domain query services:

```
[ Frontend ReportsDashboard ]
             │
             ▼
[ OperationalReportController ] (RBAC: auth:sanctum + permission:distribution.view)
             │
             ▼
[ OperationalReportService ] ──► [ CurrentDistributionResolver ] ──► [ Database (published & is_current=1) ]
             │
             ├──► Excel Driver (maatwebsite/excel - DistributionReportExport)
             ├──► CSV Driver (maatwebsite/excel with UTF-8 BOM)
             └──► PDF Driver (barryvdh/laravel-dompdf with Blade templates)
```

---

### 5. Current Distribution Integrity
1.  **Authoritative State:** Every operational report MUST execute against the current published distribution version where:
    $$\text{status} = \text{'published'} \quad \text{AND} \quad \text{is\_current} = \text{true}$$
2.  **Strict Prohibition:** Reports MUST NEVER use `MAX(id)` or `MAX(created_at)` as a proxy for currency.
3.  **Conflict Handling:** If no published distribution version with `is_current = true` exists for the requested rotation, the endpoint MUST return HTTP `409 Conflict` with a structured error payload:
    ```json
    {
      "success": false,
      "message": "No current published distribution version exists for this rotation.",
      "errors": { "version": ["No current published distribution found."] }
    }
    ```
4.  **Historical Isolation:** Historical published versions (`is_current = false`) and draft/suggested versions MUST NEVER appear in operational exports.

---

### 6. Report Data Contracts

#### A. Master Student Distribution Report
*   **Columns:**
    1.  `university_number` (Univ. Number)
    2.  `full_name_en` (Student Name EN)
    3.  `full_name_ar` (Student Name AR)
    4.  `rotation_name` (Rotation)
    5.  `block_code` (Block Code)
    6.  `from_week` (Start Week)
    7.  `to_week` (End Week)
    8.  `department_name` (Department)
    9.  `training_site_name` (Training Site)
    10. `supervisor_name` (Supervisor)
*   **Sorting:** `rotation_blocks.from_week` ASC, `students.full_name_ar` ASC.

#### B. Department Distribution Report
*   **Columns:** Identical schema to Master Student Distribution, pre-filtered by `department_id`.

#### C. Training Site Capacity Report
*   **Columns:**
    1.  `site_name_en` (Site Name EN)
    2.  `site_name_ar` (Site Name AR)
    3.  `capacity` (Capacity Limit from `site_capacity_rules.max_students`)
    4.  `assigned` (Assigned Student Count)
    5.  `remaining` (Remaining Capacity)
    6.  `utilization_percent` (Utilization Percentage)
    7.  `status` (`UNDER_CAPACITY` | `NEAR_CAPACITY` | `AT_CAPACITY` | `OVER_CAPACITY` | `NO_RULE` | `NO_CAPACITY`)

#### D. Supervisor Workload Report
*   **Columns:** Identical schema to Master Student Distribution, pre-filtered by `supervisor_id`, with supervisor capacity metrics.

#### E. Unassigned Students Report
*   **Columns:**
    1.  `university_number` (Univ. Number)
    2.  `full_name_en` (Student Name EN)
    3.  `full_name_ar` (Student Name AR)
    4.  `status` (Fixed value: `Unassigned`)

---

### 7. Filter Parity Rules
1.  **UI vs Export Parity:** The exported file MUST contain the exact same filtered subset of data displayed in the operational UI for any given parameter set.
2.  **Supported Filters:**
    *   `rotation_id` (Required)
    *   `department_id` (Optional)
    *   `training_site_id` (Optional)
    *   `supervisor_id` (Optional)
    *   `rotation_block_id` (Optional)
    *   `student_id` (Optional)
    *   `search` (Optional text search matching student name or university number)
3.  **Sanitization:** Unrecognized query parameters MUST be ignored without causing backend exceptions.

---

### 8. Cross-Format Consistency
1.  **Data Parity Rule:** For any report request with identical filters, the exported Excel (`.xlsx`), CSV (`.csv`), and PDF (`.pdf`) MUST contain identical data records.
2.  **Field Uniformity:** PDF templates MUST include both English and Arabic student names, matching the Excel/CSV column definitions.
3.  **Formatting Parity:** Dates and weeks MUST use consistent notation (e.g. `Week X - Week Y` or `W1 - W4`) across all export formats.

---

### 9. Empty Dataset Rules
1.  **Valid Rotation with 0 Records:** When a valid current published distribution exists but zero assignments match the applied filters:
    *   **Excel / CSV:** Downloads file containing full header row and zero data rows. HTTP `200 OK`.
    *   **PDF:** Renders document with header, metadata summary, empty table body, and a message stating "No records found matching criteria". HTTP `200 OK`.
2.  **No Published Distribution:** Returns HTTP `409 Conflict` (JSON response, no file download).

---

### 10. Unassigned Student Rules
1.  **Definition:** An active student in the rotation's target student subgroup who has NO assignment in the current published `distribution_version_id`.
2.  **Exclusions:**
    *   Inactive students are excluded.
    *   Students assigned in the current published distribution are excluded.
    *   Students from unrelated academic levels/groups are excluded.
3.  **Immutability:** Unassigned status MUST be derived dynamically from the current published distribution state without mutating database tables.

---

### 11. Capacity Report Integrity
1.  **Capacity Source of Truth:**
    $$\text{Capacity} = \text{site\_capacity\_rules.max\_students}$$
    The legacy column `training_sites.max_students_per_period` MUST NOT be used.
2.  **Utilization Formula:**
    $$\text{utilization\_percent} = \left( \frac{\text{assigned\_count}}{\text{max\_students}} \right) \times 100$$
3.  **Status Categorization Rules:**
    *   If `max_students` is `null`: Status = `NO_RULE`.
    *   If `max_students == 0`: Status = `NO_CAPACITY`.
    *   If `assigned_count > max_students`: Status = `OVER_CAPACITY`.
    *   If `assigned_count == max_students`: Status = `AT_CAPACITY`.
    *   If `utilization_percent >= 75.0%`: Status = `NEAR_CAPACITY`.
    *   Otherwise: Status = `UNDER_CAPACITY`.

---

### 12. Supervisor Report Integrity
1.  **Assignment Counting:** Only assignments linked to `distribution_version_id` (where `is_current = true`) with matching `supervisor_id` are counted.
2.  **Workload Policy:** Supervisor `max_students` overage generates a soft warning in summaries but MUST NOT block report export.

---

### 13. Security & RBAC
1.  **Authentication & Authorization:** All export routes MUST be protected by:
    *   `auth:sanctum`
    *   `permission:distribution.view`
2.  **Server-Side Isolation:** All filters are validated server-side. Users cannot inspect or export data outside their authorized scope.

---

### 14. Data Leakage Prevention
1.  **Allowed Fields:** Only operational fields defined in Section 6 may be included in export files.
2.  **Prohibited Fields:** Password hashes, personal emails, national IDs, internal database tokens, and raw internal JSON blobs MUST be excluded.

---

### 15. Null & Relationship Handling
1.  **Nullable Supervisor:** Renders as `'Unassigned'` in English and `'غير معين'` in Arabic.
2.  **Missing Entity Name:** Falls back safely to `'N/A'` or empty string without throwing PHP `Trying to get property of non-object` warnings.

---

### 16. Date & Time Integrity
1.  **Week Notation:** Rotation blocks specify `from_week` and `to_week` integers. Reports display them formatted as `Week X - Week Y` (or `W1-W4` in compact PDF columns).
2.  **Timestamping:** PDF reports include an official header with generation timestamp: `Generated at: YYYY-MM-DD HH:MM:SS`.

---

### 17. Arabic & Unicode Requirements
1.  **CSV UTF-8 BOM:** CSV exports MUST prepend the UTF-8 Byte Order Mark (`\xEF\xBB\xBF`) to ensure Microsoft Excel opens Arabic text cleanly without corruption.
2.  **PDF RTL Rendering:** PDF documents MUST include `dir="rtl"` and use `DejaVu Sans` font for valid Arabic glyph rendering.

---

### 18. File & HTTP Response Rules
1.  **Content-Type Headers:**
    *   Excel: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
    *   CSV: `text/csv; charset=UTF-8`
    *   PDF: `application/pdf`
2.  **Filename Standard:**
    `[report_name]_[timestamp].[ext]`
    (e.g., `student_distribution_1692100000.xlsx`).

---

### 19. Performance Requirements
1.  **N+1 Prevention:** Eager loading (`with(['student', 'rotationBlock.rotation', 'trainingSite', 'department', 'supervisor'])`) MUST be maintained.
2.  **Query Limit:** Report generation MUST execute in $\le 15$ total database queries regardless of assignment count.
3.  **Memory Limit:** Streaming via `FromQuery` MUST be used for Excel/CSV exports to maintain linear memory usage $O(1)$.

---

### 20. Export vs Pagination Semantics
1.  **Full Dataset Export:** Export endpoints export the ENTIRE filtered dataset matching query parameters, ignoring UI pagination parameters (`page`, `per_page`).

---

### 21. Snapshot & Consistency
1.  **Read Snapshot:** Reports reflect the exact published database state at the moment of request execution.
2.  **Immutability:** Because published assignments are immutable (except supervisor reassignment), report reads do not lock database tables.

---

### 22. Auditability
1.  **Read Operations:** Standard report GET requests do not create audit log entries to prevent database inflation.
2.  **System Auditing:** Operational supervisor reassignments continue to trigger audit logs via `SupervisorReassignmentService`.

---

### 23. Testing Strategy for Phase 5E-2 Implementation

| Category | Test Case Description | Expected Result |
| :--- | :--- | :--- |
| **Auth** | Unauthenticated user requests export | `401 Unauthorized` |
| **Auth** | User without `distribution.view` requests export | `403 Forbidden` |
| **Version** | Rotation with no current published version | `409 Conflict` |
| **Parity** | Export with `department_id` filter applied | File contains only records for specified department |
| **Format** | Request format=excel | Returns `.xlsx` with valid headers |
| **Format** | Request format=csv | Returns `.csv` starting with UTF-8 BOM |
| **Format** | Request format=pdf | Returns valid `.pdf` binary stream |
| **Unicode** | Arabic student name exported to CSV | Arabic characters preserved |
| **Performance**| Export 100+ assignments | Query count stays $\le 15$ |

---

### 24. Regression Requirements
The following completed phases MUST remain 100% green without modification:
*   Phase 3B — Distribution Algorithm & Capacity Engine
*   Phase 4A — Manual Assignment Foundation
*   Phase 4B — Approval & Publication Engine
*   Phase 4C — Workbench & Version Comparison
*   Phase 5A — Current Published Distribution APIs
*   Phase 5B — Student & Administrative Schedules
*   Phase 5C — Supervisor Management & Portal
*   Phase 5D — Department & Site Roster Views

---

### 25. Open Business Decisions

1.  **Decision 1: CSV UTF-8 Byte Order Mark (BOM)**
    *   *Options:* Standard UTF-8 vs UTF-8 with BOM.
    *   *Recommended:* Include UTF-8 BOM (`\xEF\xBB\xBF`). Crucial for administrative Excel users in Arabic environments.
    *   *Impact:* Low risk, high usability gain.

2.  **Decision 2: PDF Column Density & Layout**
    *   *Options:* Portrait vs Landscape orientation.
    *   *Recommended:* Landscape for Master, Department, and Site Rosters; Portrait for Unassigned Students.
    *   *Impact:* Prevents table truncation in PDF downloads.

---

### 26. Recommended Implementation Sequence

*   **Phase 5E-2A: Data Contract & PDF Hardening**
    *   Update PDF templates to include `full_name_en` alongside `full_name_ar` for strict parity with Excel/CSV.
    *   Set Landscape orientation on multi-column PDF exports.

*   **Phase 5E-2B: CSV Encoding Hardening**
    *   Inject UTF-8 BOM header into CSV export response streams.

*   **Phase 5E-2C: Filter Parity Hardening**
    *   Ensure `trainingSiteCapacity` and `unassignedStudents` accept and apply optional filter scope parameters.

*   **Phase 5E-2D: Test Suite Hardening**
    *   Add explicit assertions in `Phase5ETest.php` for CSV BOM, PDF layout, and filter parity.

---

### 27. Definition of Done
* [ ] Current published distribution logic strictly enforced via `CurrentDistributionResolver`.
* [ ] Cross-format parity (Excel, CSV, PDF) verified.
* [ ] UTF-8 BOM prepended to CSV streams.
* [ ] PDF templates include English & Arabic names in Landscape orientation.
* [ ] All query filters applied consistently to exports.
* [ ] Zero N+1 query regressions ($\le 15$ queries per export).
* [ ] RBAC (`permission:distribution.view`) enforced on all endpoints.
* [ ] All 186+ backend tests and 30+ frontend tests pass.

---

### 28. Final Readiness Verdict

**READY FOR PHASE 5E-2 IMPLEMENTATION**

*The current baseline architecture is robust, passing all regression tests, and fully prepared for the quality hardening steps outlined in this specification.*

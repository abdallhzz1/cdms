# PROJECT_RULES.md

**Project:** Clinical Department Management System (CDMS)
**Organization:** Hebron University — Faculty of Medicine — Clinical Department
**Status:** Constitution locked (unchanged since v1.0). Implementation is at Phase 2 — Authentication & Authorization; Phase 1 Foundation and Phase 2 are built. No business modules yet.
**Document version:** 1.0 — 2026-08-13 (rules unchanged; status line updated 2026-08-14 during Phase 1+2 consolidation)

This file is the binding rulebook for every phase of this project. It applies to human developers and to any AI coding agent (Cursor, Claude, Antigravity, or other) working on this codebase. When in doubt, this file and `ARCHITECTURE.md` win over convenience, speed, or an agent's own preference.

Source documents this file is derived from:
- `Clinical_Department_Management_System_Blueprint_v1.docx` (System Blueprint)
- `Clinical_Department_Detailed_Requirements_Business_Rules_v1.docx` (DRBR)
- `Clinical_Department_Data_Dictionary_v1.xlsx`
- `Clinical_Department_ERD_Database_Architecture_v1.xlsx`
- `Clinical_Department_Permission_Matrix_Workflows_v1.xlsx`
- `Clinical_Department_UI_UX_Information_Architecture_v1.xlsx`
- Raw source workbook ("بيانات الدائرة السريرية الشاملة") — treated strictly as input/migration source, never as the application schema

These five design artifacts were already produced in sequence (Blueprint → DRBR → Data Dictionary → ERD → Permission Matrix → UI/UX) and are internally consistent with each other and with this constitution. They are the functional baseline. Nothing below invents content beyond what they already establish; where something is genuinely undecided, it is listed in Section 11 as an Open Decision rather than guessed.

---

## 1. Non-negotiable engineering principles

1. **Enter data once, reuse everywhere.** No student, staff member, course, rotation, department, document, evaluation, or workflow record is duplicated across modules without a documented reason.
2. **MySQL is the single source of truth** for structured business data. React never talks to MySQL directly. Every read/write goes through the Laravel REST API.
3. **Backend enforces everything that matters.** Authorization, business rules, and workflow transitions are enforced server-side. The frontend may hide UI for convenience, but it is never the security boundary.
4. **Historical data is never silently overwritten.** Status changes, group/clinical assignments, distributions, grades, evaluations, course/plan versions, contracts, performance scores, correspondence, and meeting minutes use history tables, versions, or `effective_from`/`effective_to` patterns. Published records become immutable; changes create a new revision.
5. **Approval is a workflow, not a boolean.** Every important process (distribution, grades, correspondence, course reports, minutes, KPI results, improvement plans, advising, agreements) moves through explicit states with actor, timestamp, previous state, new state, and reason recorded. No endpoint lets a user skip a transition.
6. **Authorization = Role + Permission + Scope.** A role alone never determines what a user can see or do. Scope (own department, assigned students, assigned advisees, etc.) is enforced in the backend on every query and mutation.
7. **No student accounts in Phase 1.** Students are data subjects, not system actors. Do not build student login, student portal, or student-facing screens in this phase.
8. **The Vice Dean is a first-class, independent actor** — own account, role, permissions, dashboard, approval steps, and audit trail. Never modeled as a permission bundle inside another role.
9. **System Administrator is technical, not academic.** Managing users/roles/settings does not grant academic or business approval authority unless explicitly and separately assigned.
10. **Bilingual from day one.** Every user-facing string is a translation key (e.g. `students.title`), never hardcoded text — this includes validation messages, buttons, statuses, notifications, and PDF templates. Arabic is RTL, English is LTR; the two are never mixed in one layout.
11. **Excel is a source format, never the database.** No 1:1 mirroring of workbook sheets into tables. Migration goes through cleaning, mapping, staging, validation, preview, and reconciliation before anything reaches production tables.
12. **Files are metadata-in-MySQL + content-in-storage**, never BLOBs in the database, and every download passes an authorization check.
13. **Nothing is invented.** Any business rule, approval level, threshold, or form field not present in the source documents is logged as an Open Decision (Section 11) or a Change Request — never guessed into the schema or the UI.

---

## 2. Development methodology

- The system is built **phase by phase**. One module per implementation cycle; each module includes backend + UI + permissions + tests together, not as separate later passes.
- Each phase must be scoped, implemented, tested, reviewed, and stabilized before the next phase starts.
- **No phase auto-continues into the next.** After finishing a phase, stop and report: what was implemented, files created/changed, database changes, API changes, tests performed, known issues, assumptions made, and the recommended next phase. Then wait for explicit instruction.
- Before writing code for a module, the acting engineer/agent restates its understanding of that module's requirements against the DRBR and Permission Matrix, so misunderstandings surface before code exists, not after.
- No AI agent changes an already-shipped schema without a migration and a stated impact analysis.
- Every new business rule discovered or clarified during implementation is recorded in a running Change Log (see Section 12), not left implicit in a commit message.

### Definition of Done (per module)
- UI complete in Arabic and English.
- CRUD operations respect permission + scope.
- Business rules enforced in the backend (service/domain layer, not just controllers).
- Server-side validation.
- Workflow implemented where the module requires one.
- Audit logging wired in.
- Automated tests: feature, authorization, and workflow tests at minimum.
- Error handling, empty states, and loading states covered.
- Responsive across desktop/tablet/mobile.
- Export/report covered if in scope for that module.
- Developer-facing documentation for the module.

---

## 3. Roles, permissions, and scope

Ten actors are approved (Section 7 of Prompt 00, matched 1:1 by the Roles sheet in the Permission Matrix workbook):

System Administrator, Dean, Vice Dean, Clinical Department Director, Administrative Assistant, Department Head, Research & Teaching Assistant, Clinical Supervisor, Academic Advisor, Quality Unit.

Rules:
- Permissions are atomic (`module.action`, e.g. `grades.approve`, `distribution.publish`) and assigned to roles via a role-permission mapping — never hardcoded per-controller checks only.
- Scope is enforced per record: a Clinical Supervisor only ever sees students/groups they are assigned to; a Department Head only sees their own department; the Clinical Director has department-wide scope; Dean/Vice Dean scope is college-wide or delegated, per the configured approval chain.
- A user may hold multiple roles.
- Segregation of duties: a user cannot approve their own submitted record where the workflow requires independent review.
- The full permission matrix (Roles, Permissions, Role_Permission_Matrix, Role_Scope) in `Clinical_Department_Permission_Matrix_Workflows_v1.xlsx` is the authoritative reference for what each role can view/manage/approve. Any gap found during implementation is an Open Decision, not a guess.

---

## 4. Workflow rules

- Standard state vocabulary (from `Workflow_States`): `DRAFT → SUBMITTED → UNDER_REVIEW → (RETURNED | APPROVED | REJECTED) → PUBLISHED → LOCKED → ARCHIVED`, with `NEW_REVISION` used to reopen a locked/archived/rejected record without touching its history.
- Fourteen named workflows are already defined (correspondence in/out, clinical distribution, grades, supervisor evaluation, course report, individual/group advising, meeting minutes, tasks, KPI result, improvement plan, site agreement, student risk case) — see the `Workflows` and `Approval_Matrix` sheets. Implement against these; do not invent parallel ad hoc status fields.
- The approval matrix (who prepares, reviews, approves at each level) must be configurable in the system, not hardcoded — the values currently given are the initial template pending Section 11 confirmation.
- Every workflow transition is audited (actor, from-state, to-state, timestamp, reason where applicable).

---

## 5. Data & migration rules

- Normalize the business domain; do not create one table per Excel sheet (the source workbook has 45 data sheets — the Data Dictionary already normalizes these into ~65 entities, and the ERD refines that into a relational schema of ~84 tables). Follow that normalization, not the spreadsheet layout.
- Every migrated field must have a documented source mapping (see `Source_Mapping` sheet) before it is imported.
- Known data-quality issues already flagged inside the source workbook itself (e.g., mismatched student counts between mailing lists and the annual report on sheet `05_الدفعات_والمجموعات`) must be reconciled during the Migration_Plan's data-profiling step, not silently resolved by picking one number.
- Soft delete/archive only. No hard delete of historical academic, financial, or approval records.
- Deleting a Firebase-style "row" is never how corrections happen; corrections go through a Correction/Revision workflow that preserves the old value.

---

## 6. Security & audit rules

- Every protected page/API requires an authenticated session; every protected API re-checks authorization server-side regardless of what the UI shows.
- Passwords hashed with a modern algorithm (Argon2id/bcrypt); secrets live in environment configuration, never in source control.
- CSRF/XSS/SQL-injection protections are framework-enforced, not bolted on later.
- File uploads are validated by type/size and require authorization to download; never expose raw storage paths.
- Every create/update/delete/approve/publish/lock action on a business record writes an audit log entry: user, action, entity, entity ID, old value, new value, reason (when applicable), timestamp, and related workflow ID.
- Audit logs never contain passwords or raw secrets.
- Rate limiting applies to authentication and other sensitive endpoints.
- Backups (database + files) are encrypted and restore-tested, not just taken.

---

## 7. Bilingual (i18n) rules

- All labels, statuses, validation messages, notifications, menus, and PDF templates go through translation keys — never hardcoded Arabic or English strings inside components or business logic.
- The database stores language-neutral codes/enums; translation happens at the presentation layer.
- Arabic renders RTL, English renders LTR, and the two directions are never mixed within a single screen.
- Search must tolerate Arabic/English name variants where reasonably possible.
- PDF templates and reports support both languages.

---

## 8. UI/UX rules

- Calm, professional, light, information-dense where administrative work needs it — no decorative animation, no gaming-style dashboards, no unnecessary cards.
- Status is never communicated by color alone.
- Server-side pagination/filtering/sorting on every list screen; never load thousands of rows into the browser.
- Desktop is the primary environment for heavy administrative work; tablet and mobile must remain usable for the essential operational tasks (attendance, approvals, quick lookups).
- The screen inventory, navigation tree, and reusable components already defined in `Clinical_Department_UI_UX_Information_Architecture_v1.xlsx` (Screen_Map, Navigation, UI_Components, Dashboards, Design_Principles) are the baseline for future UI work — do not invent a competing information architecture without a documented reason.

---

## 9. Performance rules

- Pagination and filtering instead of full-table loads.
- Indexes on fields used for search/filtering (see the `Indexes` sheet in the ERD workbook for the initial list).
- Eager loading to avoid N+1 queries.
- Background queues for PDF generation, large exports, and notifications — never block a normal HTTP request on them.
- Cache is allowed for stable reference data only; it is never the source of truth.

---

## 10. Testing rules

Minimum coverage per module: unit tests for calculated logic (grades, KPI scores), feature tests for core flows, authorization tests (each actor attempting access outside its scope must fail), workflow tests (submit → review → approve → publish end to end), and regression checks that a module change doesn't break another module. Import/migration logic gets its own validation and duplicate-handling tests. File upload gets rejection tests for disallowed types.

---

## 11. Open Decisions Register

These are explicitly unresolved in every source document reviewed (Data Dictionary `Open_Decisions` sheet, DRBR Section 31, Blueprint Section 31). They must be resolved by the Clinical Department / College leadership — not invented by an engineer or an AI agent — before the module they affect is built in detail.

| ID | Decision needed | Blocks |
|----|------------------|--------|
| OD-001 | Final, confirmed approval matrix (levels/approvers) for distribution, grades, correspondence, reports | Workflow engine configuration for those modules |
| OD-002 | Official absence threshold(s) and alert rules | Attendance alerts, at-risk logic |
| OD-003 | Final distribution constraint rules (students per supervisor/site/department) | Suggested Distribution engine |
| OD-004 | Official, frozen evaluation/advising/quality forms | Assessment/advising/quality form versioning |
| OD-005 | Official KPI formulas and weights | Performance Score calculation |
| OD-006 | Confidentiality classification (what is Confidential vs. Highly Confidential) | Correspondence, advising, document scope rules |
| OD-007 | Digital signature vs. account-based approval policy | PDF/approval implementation |
| OD-008 | Whether/when to integrate with the university's central student/registration system | Long-term architecture, not required for Phase 1 |
| OD-009 | File and data retention / backup policy | Storage lifecycle, backup automation |
| OD-010 | Confirmation of department names/heads flagged as uncertain in the source workbook (e.g., `13_الأقسام`) | Department master data migration |
| OD-011 | Final official name of each Actor per the university's administrative structure | Cosmetic only; does not block backend work |

New Open Decisions discovered during implementation are added here (or to a linked register) with the same fields: ID, decision needed, why, owner, status.

---

## 12. Change Log convention

Every new business rule, every resolved Open Decision, and every architectural decision made after this document is committed gets one dated entry recording: what changed, why, who decided it, and what it affects. This project already carries 10 architecture decision records (`ADR-001`–`ADR-010`) from the ERD workbook (e.g., normalized schema over one-table-per-sheet, session-first attendance model, configurable workflow engine, mandatory backend authorization, immutable published revisions) — continue that numbering rather than starting a parallel log.

---

## 13. Working with AI coding agents

- Give the agent this file, `ARCHITECTURE.md`, and the relevant source workbook/section — never a bare one-line prompt.
- One module per work session.
- Before code: the agent restates its understanding of the module's requirements for confirmation.
- No schema change to an already-built module without a migration plan and stated impact.
- Every feature ships with tests; every permission has a test; every workflow has a test.
- No real student/staff personal data used in development — use structurally realistic but fictional data, per university data policy.
- Before production: security review, backup/restore test, and user acceptance testing are required gates, not optional.

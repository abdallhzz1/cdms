# ARCHITECTURE.md

**Project:** Clinical Department Management System (CDMS)
**Organization:** Hebron University — Faculty of Medicine — Clinical Department
**Status:** Approved high-level architecture (unchanged since v1.0). Implemented through Phase 2 — Foundation (DB/API/SPA) and Auth/Roles/Permissions are built; business modules are not.
**Document version:** 1.0 — 2026-08-13 (architecture unchanged; status line updated 2026-08-14 during Phase 1+2 consolidation)

This document is the architecture baseline. It sits alongside `PROJECT_RULES.md` (the rulebook) and the five design workbooks/docs delivered before it, which remain the authoritative detail source for entities, permissions, screens, and workflows. This file exists to lock the shape of the system so implementation phases don't re-litigate it.

---

## 1. System overview

CDMS is an internal administrative and academic platform for the Clinical Department at Hebron University's Faculty of Medicine. It replaces fragmented Excel files, Word documents, and email-based processes with one system of record. Core principle: **enter data once, reuse it everywhere.**

Students are data subjects, not system users, in this phase — there is no student login or student portal. Ten internal actor types access the system according to role, permission, and scope: System Administrator, Dean, Vice Dean, Clinical Department Director, Administrative Assistant, Department Head, Research & Teaching Assistant, Clinical Supervisor, Academic Advisor, Quality Unit. The Vice Dean is an independent actor with its own account, permissions, and approval role — never folded into another role.

---

## 2. High-level architecture

```
        ┌─────────────────────────────┐
        │   React + TypeScript SPA    │   Presentation layer
        │  Vite / Tailwind / Router   │   - UI, routing, forms, i18n (ar/en, RTL/LTR)
        │  TanStack Query / RHF+Zod   │   - No business rules here
        └───────────────┬─────────────┘
                         │ REST API (JSON, versioned as needed)
                         ▼
        ┌─────────────────────────────┐
        │        Laravel (PHP)        │   API + Application + Domain layers
        │  Controllers → Services →   │   - AuthN/AuthZ (Policies/Gates, Role+Permission+Scope)
        │  Domain/Policy layer        │   - Business rules, workflow engine
        │  Workflow Engine            │   - Validation, transactions
        └───────┬─────────────┬───────┘
                │             │
                ▼             ▼
        ┌───────────────┐ ┌───────────────────┐
        │  MySQL 8.x     │ │ File/Object        │
        │  (source of    │ │ Storage             │
        │  truth)        │ │ (metadata in MySQL) │
        └───────────────┘ └───────────────────┘
                │
                ▼
        ┌───────────────────────────┐
        │ Queue (Laravel Queue) +    │  Background: PDF generation, Excel
        │ optional Redis             │  import/export, notifications, reports
        └───────────────────────────┘
```

React never talks to MySQL directly, and never owns a business rule. Laravel is the only writer to MySQL and the only place authorization is actually enforced.

### Layer responsibilities (from the approved architecture)

| Layer | Component | Responsibility | Rule |
|---|---|---|---|
| Presentation | React SPA | UI, i18n, RTL/LTR, responsive | No business rules |
| API | Laravel REST controllers | AuthN, AuthZ, request validation | Stateless where possible |
| Application | Services / use cases | Orchestrate operations | Transaction boundaries live here |
| Domain | Entities / policies | Business rules | Centralized, not scattered in controllers |
| Workflow | Workflow engine | Submit/review/approve/return/publish | Configurable, not hardcoded per module |
| Data | MySQL | Transactional relational data | FKs, indexes, constraints enforced |
| Files | Object/file storage | PDFs, CVs, evidence, documents | Metadata in DB; authorized downloads only |
| Queue | Background jobs | PDF, exports, notifications | Retryable, doesn't block requests |
| Cache | Redis (optional) | Reference data / queue backing | Never the source of truth |
| Observability | Logs/metrics | Errors, slow queries, health | No sensitive payloads in normal logs |
| Backup | DB + files | Recovery | Automated, restore-tested |

---

## 3. Approved technology stack

**Frontend:** React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, React Hook Form, Zod.

**Backend:** PHP 8.3+, Laravel, REST API (versioned as needed).

**Database:** MySQL 8.x.

**Infrastructure (introduced when a phase actually needs them):** Redis, Laravel Queue/background jobs, file storage, PDF generation, Excel import/export.

**Authorization:** Laravel Policies/Gates implementing Role + Permission + Scope.

**Deployment target:** Nginx + PHP-FPM + Laravel + MySQL (+ optional Redis), Linux server. Must run identically in local development and production — no developer-machine-specific assumptions.

### Resolved ambiguity: frontend integration pattern

The System Blueprint's technology section listed the frontend as "React + TypeScript **or** Laravel + Inertia + React." This project's fixed stack (Prompt 00, Section 3–4) requires a REST API boundary between a standalone React/TypeScript SPA and Laravel — explicitly: *"Never let React connect directly to MySQL"* and clear separation of concerns between frontend and backend. Inertia.js blurs that boundary by coupling the frontend to server-rendered routing. **Decision: the Inertia option is rejected. CDMS is a decoupled React SPA talking to a Laravel REST API.** This is recorded here as ADR-011 (continuing the numbering from the ERD workbook's `Architecture_Decisions` sheet, ADR-001–ADR-010).

---

## 4. Authorization model

Authorization is **Role + Permission + Scope**, enforced server-side on every request:

- **Role** — one of the ten approved actors; a user may hold more than one.
- **Permission** — atomic, `module.action` (e.g. `distribution.publish`, `grades.approve`, `advising.export_pdf`). The full permission catalog lives in the Permission Matrix workbook and is not reproduced here to avoid drift between two "sources of truth" — that workbook is canonical.
- **Scope** — the subset of records a role+permission applies to: a Clinical Supervisor's scope is their assigned students/rotations; a Department Head's scope is their own department; the Clinical Director's scope is the whole department; Dean/Vice Dean scope is college-wide or delegated per the configured approval chain; System Administrator's scope is technical (users, roles, settings) and explicitly excludes academic approval authority by default.
- **Workflow** — sensitive operations additionally require passing through a configured workflow; scope and permission alone do not let a user skip a required review/approval step.

---

## 5. Workflow & state model

Standard state vocabulary, shared across modules wherever it applies:

```
DRAFT → SUBMITTED → UNDER_REVIEW → RETURNED → SUBMITTED (loop)
UNDER_REVIEW → APPROVED → PUBLISHED → LOCKED → ARCHIVED
UNDER_REVIEW → REJECTED → NEW_REVISION → DRAFT
DRAFT/RETURNED → CANCELLED → ARCHIVED
LOCKED/ARCHIVED/REJECTED → NEW_REVISION → DRAFT   (never edits history directly)
```

Eleven states total (source: Permission Matrix workbook `Workflow_States` sheet): `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `RETURNED`, `APPROVED`, `PUBLISHED`, `LOCKED`, `REJECTED`, `CANCELLED`, `ARCHIVED`, `NEW_REVISION`. The DRBR's own "general states" list (Section 5) names nine of these and omits `CANCELLED`/`NEW_REVISION`; DRBR frames that list as illustrative ("wherever applicable"), not exhaustive, so the Permission Matrix workbook's fuller state set is treated as canonical.

Fourteen concrete workflows are already scoped in the Permission Matrix & Workflows workbook (`Workflows` and `Approval_Matrix` sheets): outgoing/incoming correspondence, clinical distribution, grades, supervisor evaluation, course report, individual/group advising, meeting minutes, tasks, KPI result, improvement plan, site agreement, and student risk case. Every transition is recorded with actor, from-state, to-state, timestamp, and reason where applicable. Published/locked/finalized records are immutable — a further change creates a new revision rather than mutating history.

---

## 6. Module boundaries

Fourteen module boundaries are approved (source: ERD workbook `Module_Boundaries` sheet, cross-checked against the Blueprint's module list):

| Module | Depends on | Critical rule |
|---|---|---|
| Students | Academic years, curriculum, staff | Historical data preserved; no hard delete |
| Staff (Heads/Supervisors/RTA) | Departments, users | Performance evidence is versioned |
| Curriculum (Courses/Plans/ILO/PLO/Syllabus) | Academic years, departments | Plan/course versions immutable after publication |
| Clinical Engine (Rotations/Blocks/Sites/Capacity/Availability) | Courses, staff, students | Conflict/capacity validation is mandatory |
| Distribution (Groups/Subgroups/Assignments) | Clinical Engine, Students | Manual + suggested; publish creates an immutable version |
| Sessions & Attendance | Distribution | Session-first model (attendance hangs off a session, not the reverse) |
| Assessment (Evaluation forms) | Students, staff, rotations | Form version freeze on deployment |
| Grades | Courses, students | Weights sum to 100%; locked grades need a correction workflow |
| Advising | Students, staff | PDF + attachments + full history; confidential scope |
| Quality (Surveys/KPIs/Improvement) | Staff, departments, academic year | Versioned; evidence-linked |
| Correspondence | Staff, workflow engine | Real multi-step workflow, not a status flag |
| Meetings & Minutes | Staff, workflow engine | Finalized minutes are immutable |
| Reports | All of the above | Read-optimized cross-module views; no duplicated master data |
| Security | All modules | Users/roles/permissions/scopes/audit — backend-enforced everywhere |

Note on naming: `groups`/`subgroups` (persistent cohort structure, e.g. cohort A → subgroup A1) is intentionally distinct from `student_clinical_assignments` (the time-bound record of where a subgroup trains in a given week/rotation). This is not a duplicate concept — it mirrors the real distinction between "which cohort a student belongs to" and "where that cohort is scheduled this week" — and both are already modeled that way consistently across the Data Dictionary and ERD workbooks.

Note on module taxonomy: three different documents group modules for three different purposes, and none of them is wrong — they answer different questions. The ERD workbook's 14-row `Module_Boundaries` table above answers "how is the backend decomposed," the UI/UX workbook's `Navigation` tree answers "how does the frontend route," and the Blueprint's Section 6 module list is an introductory/descriptive grouping used for the phased roadmap, not an implementation boundary. Dashboard, Calendar, and Administration/Security appear as top-level items in the Blueprint and in UI/UX Navigation but are not their own rows in `Module_Boundaries` because, backend-side, they are cross-cutting (Dashboard reads across modules; Calendar is `academic_years`/`semesters`/`calendar_events`, a shared dependency of several modules rather than an owner of one; Administration and Security are the same boundary under two names). Build backend services against `Module_Boundaries`; build frontend routing against the UI/UX `Navigation`/`Screen_Map` sheets.

---

## 7. Data architecture principles

- Normalized relational schema; the raw source workbook's 45 sheets are **not** mirrored as 45 tables. The Data Dictionary already collapses them into ~65 business entities, and the ERD workbook refines that into a ~84-table relational schema (users/roles/permissions, academic structure, students, staff, curriculum, clinical training/distribution, sessions/attendance, assessment/grades, advising, quality/KPIs, correspondence/meetings, calendar, files, workflow engine, audit).
- Where the Data Dictionary (v1, entity-level) and the ERD workbook (v1, table-level) use slightly different names for the same concept (e.g. `student_assignments` → `student_clinical_assignments`, `assessment_schemes` → `course_assessment_schemes`), **the ERD workbook's naming is canonical** — it is the later, more normalized artifact in the documented design sequence (Blueprint → DRBR → Data Dictionary → ERD). This gets finalized and locked when the actual migrations are written in the Foundation phase.
- History is preserved via status-history tables, `effective_from`/`effective_to`, and versioning — never via overwriting a historical row.
- Foreign keys default to `RESTRICT` on historically significant relationships (students, grades, contracts, distribution, workflow records); `CASCADE` is reserved for pure composition data (e.g. survey answers belonging to a response, agenda items belonging to a meeting).
- Soft delete/archive only for business records; audit logs and locked academic records are never physically deleted.
- The actual database (migrations, seeders) is **not built in this phase**. This section describes the agreed shape only; the ERD workbook is the working reference until a dedicated ERD/database phase formally implements it.

---

## 8. File management

File content lives in controlled storage; only metadata (owner, entity reference, type, size, uploaded_by, uploaded_at) lives in MySQL. No file is ever served from an unauthenticated/unrestricted path — every download passes an authorization check against the requesting user's role/permission/scope for the entity the file is attached to.

---

## 9. Localization architecture

Arabic and English are supported from the first screen built, not retrofitted. UI strings, validation messages, statuses, and notifications are translation keys (`students.title`, not literal text) resolved at the presentation layer. The database stores language-neutral codes/enums. Arabic renders RTL, English renders LTR; PDFs and reports respect the selected language and direction.

---

## 10. Performance & observability

Server-side pagination and filtering on every list endpoint; indexed lookup fields (student number, course code, correspondence reference, etc. — see the ERD workbook's `Indexes` sheet for the initial set); eager loading to avoid N+1 queries; background queue for PDF/export/notification generation; slow-query monitoring; no sensitive payloads in ordinary application logs (audit logs are separate and structured).

---

## 11. Reference documents (authoritative detail, not restated here)

- `Clinical_Department_Management_System_Blueprint_v1.docx` — vision, modules, actors, technical direction, phased roadmap.
- `Clinical_Department_Detailed_Requirements_Business_Rules_v1.docx` — per-module screens, fields, business rules (BR-*, DR-*, BR-DST-*, BR-GRD-*), approval matrix, Definition of Done.
- `Clinical_Department_Data_Dictionary_v1.xlsx` — entities, fields, source-to-entity mapping, relationships, enums, open decisions.
- `Clinical_Department_ERD_Database_Architecture_v1.xlsx` — canonical table list, relationships with delete policy, indexes, layered architecture, module boundaries, migration plan, ADR log.
- `Clinical_Department_Permission_Matrix_Workflows_v1.xlsx` — roles, atomic permissions, role/permission/scope matrix, the 14 workflows, approval matrix, distribution rules, workflow states, security rules.
- `Clinical_Department_UI_UX_Information_Architecture_v1.xlsx` — screen map (40 screens), navigation tree, reusable UI components, responsive rules, bilingual rules, per-role dashboards, design principles.
- Raw source workbook ("بيانات الدائرة السريرية الشاملة") — migration source only; never the application schema.

When a document above conflicts with this file, this file's resolution wins for architecture-level questions (see Section 3's Inertia decision as the example); everything else defers to those documents as the detailed baseline.

---

## 12. Change control

Architecture-level decisions are logged as numbered ADRs, continuing from the ERD workbook's `Architecture_Decisions` sheet (ADR-001–ADR-010). This document's Section 3 resolution is ADR-011. Future architecture changes get their own ADR entry (ID, decision, rationale, status) rather than silently editing this file's prose.

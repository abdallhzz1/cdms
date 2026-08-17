# Phase 7C — Arabic/English UI Text Audit

Date: 2026-08-16

## Result

**Status: not ready for acceptance.** The existing `I18nContext`, `ar.ts`, and `en.ts` work for the original shell and selected dashboard components, but a source audit found visible hardcoded English strings and technical identifiers in key operational screens. Arabic is therefore not consistently the primary interface and English switching is incomplete.

## Critical findings

| Area | Files | Finding | User impact |
| --- | --- | --- | --- |
| Manual assignment | `AssignmentModal.tsx` | Labels and placeholders expose `Student ID`, `Training Site ID`, `Supervisor ID`, and free-text numeric IDs. | Violates the human-readable terminology requirement and is untranslated. |
| Distribution workbench | `DistributionWorkbench.tsx`, `AssignmentsTab.tsx`, `UnassignedTab.tsx`, `ConflictsTab.tsx`, `ComparisonTab.tsx`, `AuditHistoryTab.tsx` | Tabs, actions, confirmation dialogs, loading/empty states, table headers, pagination, validation messages, and comparison labels are hardcoded in English. | Main clinical workflow becomes mixed-language and exposes terms such as `Student #<id>`. |
| Department roster | `DepartmentRoster.tsx` | Error label, empty state, KPIs, table headings, dates, unassigned state, and pagination are hardcoded/mixed language. | Arabic and English views do not switch cleanly. |
| Training-site roster | `TrainingSiteRoster.tsx` | All capacity statuses, warnings, KPIs, empty/error states, headings, and pagination are hardcoded in English. | Capacity warnings—the most important operational alert—are not localized. |
| Supervisor portal | `SupervisorPortal.tsx` | Heading, loading/empty states, and table headings are hardcoded in English. | Supervisor view is not bilingual. |
| Distribution list | `DistributionList.tsx` | Pagination labels are hardcoded in English. | Incomplete translation in a primary workflow. |
| Foundation route | `FoundationHome.tsx` | A technical health-check screen remains at `/`; it uses developer terminology. | An administrator does not land on a clinical dashboard immediately. |
| Directionality | `AssignmentsTab.tsx` | `text-right` is directional rather than logical. | May be visually wrong in RTL. |
| Error safety | Department/training-site roster pages | Raw `error` content is displayed next to `Error:`. | Can expose API implementation details. |

## Text inventory requiring i18n keys

- Assignment form: student, rotation block, training site, supervisor, select block, override reason, submitting, confirm, cancel.
- Assignment and unassigned tables: student, subgroup, block, site, supervisor, actions, unassigned, all blocks, loading, empty, page/next/previous.
- Audit table: timestamp, user, action, override status, details, standard, loading, empty, pagination.
- Comparison: added/removed students, moved block/site, supervisor changed, assigned/unassigned, and person labels.
- Conflicts: validation result, description, conflict type, count, loading/empty states.
- Workbench: all tabs, override warning/reason, approve/publish confirmation and validation messages.
- Department and site rosters: all headings, capacity statuses, warning copy, metrics, date connector, empty/error states, pagination.
- Supervisor portal: title, profile/assignment states, all table headings.

## Required remediation order

1. Expand the existing `ar.ts` and `en.ts` dictionaries with the complete shared workflow vocabulary; do not introduce another translation mechanism.
2. Replace every user-visible hardcoded literal above with `t(...)`, including dynamic plural/count text.
3. Replace raw identifiers in the assignment and comparison UI with searchable, human-readable records.
4. Replace raw error rendering with the shared localized error state.
5. Replace directional styling with logical properties and test Arabic (`rtl`) and English (`ltr`) on the dashboard, distribution workflow, rosters, reports, and mobile menu.
6. Replace the technical root foundation experience with a clinical dashboard redirect/landing strategy and update its tests.
7. Add i18n regression tests covering both locales and representative empty/loading/error states.

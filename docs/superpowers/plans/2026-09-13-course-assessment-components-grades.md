# Course Assessment Components and Grades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the standard course assessment components the authoritative configuration for the existing clinical, OSCE, and written grade workflow.

**Architecture:** Keep the proven `grade_entries` columns and approval flow, add stable component codes, seed every course with a standard 20/40/40 plan, and expose that plan through the grade API so the UI renders labels and limits from server configuration. The clinical value remains server-derived from supervisor assessments.

**Tech Stack:** Laravel/PHP, MySQL, React/TypeScript, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-13-course-assessment-components-grades-design.md`

## Global Constraints

- Existing course assessment components are replaced.
- Codes are `clinical`, `osce`, and `written`; weights and maxima are 20, 40, and 40.
- The browser must never submit the official clinical score.
- Existing grade approval and reporting fields remain compatible.

---

### Task 1: Standard assessment plan migration

**Files:**
- Create: `backend/database/migrations/2026_09_13_120000_standardize_course_assessment_components.php`
- Test: `backend/tests/Feature/CourseManagementWorkflowTest.php`

**Interfaces:**
- Produces: unique `(course_id, code)` components available through `Course::assessmentComponents()`.

- [ ] Add a failing migration/model test that expects exactly the three standard codes and weights for a course.
- [ ] Run the focused test and confirm the standard codes are missing.
- [ ] Add `code`, replace existing component rows transactionally, and create the unique index.
- [ ] Update model fillable attributes and run the focused test.

### Task 2: Grade API consumes the course plan

**Files:**
- Modify: `backend/app/Http/Controllers/Api/V1/GradeEntryController.php`
- Test: `backend/tests/Feature/GradeAndRtaIntegrationTest.php`

**Interfaces:**
- Produces: `assessment_components` in grade options and roster responses.
- Consumes: standard component codes and `max_score` values.

- [ ] Add failing tests for returned component metadata and server-side rejection above configured maxima.
- [ ] Run focused tests and confirm failures are caused by absent metadata/dynamic validation.
- [ ] Load the course plan, expose it, validate OSCE/written against it, and preserve server-derived clinical marks.
- [ ] Validate plan completeness before submission and run focused backend tests.

### Task 3: Dynamic grade sheet presentation

**Files:**
- Modify: `frontend/src/pages/GradesPage.tsx`
- Test: `frontend/src/pages/GradesPage.test.tsx`

**Interfaces:**
- Consumes: course `assessment_components` with `code`, localized name, weight, and maximum.

- [ ] Add a failing UI test that returns component metadata and expects dynamic column labels/maxima.
- [ ] Run the focused test and confirm it fails on the current fixed headings.
- [ ] Render the plan summary and score input maxima from API metadata while keeping the clinical field read-only.
- [ ] Update Excel headings and run the focused UI tests.

### Task 4: Full verification and delivery

**Files:**
- Modify generated production assets through `npm run build`.

- [ ] Run backend grade/course tests.
- [ ] Run frontend grade tests and production build.
- [ ] Run `git diff --check` and inspect the final diff.
- [ ] Commit, push `main`, and provide server migration/cache commands.

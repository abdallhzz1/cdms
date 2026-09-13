# Student Groups Workspace UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `/distribution/groups` around cycle monitoring and move subgroup planning into a modal.

**Architecture:** Keep `StudentGroupsPage` API operations and permission checks intact. Add one modal state for planning, derive compact cycle metrics from the selected cycle, and replace the duplicated cycle navigation and summary blocks with one responsive workspace header.

**Tech Stack:** React 19, TypeScript, React Router, TanStack Query, Tailwind CSS, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-13-student-groups-workspace-ui.md`

## Global Constraints

- Do not change API contracts, permissions, or registration business rules.
- Planning must be absent from the main page until opened from its button.
- Preserve complete Arabic and English copy.
- Generate and commit production frontend assets because the server cannot run npm.

---

### Task 1: Planning dialog behavior

**Files:**
- Create: `frontend/src/pages/StudentGroupsPage.test.tsx`
- Modify: `frontend/src/pages/StudentGroupsPage.tsx`

**Interfaces:**
- Consumes: existing `Modal`, `planningMode`, `planningValue`, `generateSubgroups()`.
- Produces: `planningOpen` state and a `Plan subgroup split` / `إعداد التقسيم` action.

- [x] **Step 1: Write the failing test**

Render the page with a selected cycle, verify planning content is absent, click the planning action, and verify the planning dialog appears.

- [x] **Step 2: Run the focused test and confirm failure**

Run `npm test -- --run src/pages/StudentGroupsPage.test.tsx` and expect failure because planning is rendered inline.

- [x] **Step 3: Implement the modal**

Add `planningOpen`; move the existing planning controls and preview cards into `Modal maxWidth="2xl"`; expose one permission-gated action in the cycle header.

- [x] **Step 4: Run the focused test and confirm success**

Run `npm test -- --run src/pages/StudentGroupsPage.test.tsx` and expect all tests to pass.

### Task 2: Workspace hierarchy

**Files:**
- Modify: `frontend/src/pages/StudentGroupsPage.tsx`
- Test: `frontend/src/pages/StudentGroupsPage.test.tsx`

**Interfaces:**
- Consumes: selected `Cycle` and existing cycle actions.
- Produces: one cycle selector, four summary metrics, one action cluster, and a labeled main-groups section.

- [x] **Step 1: Extend the test with hierarchy assertions**

Assert that the selected cycle selector, roster count, registered count, student selections, subgroup count, and main-groups heading are visible.

- [x] **Step 2: Implement the responsive workspace header**

Use a compact card with a native cycle selector, status badge, four summary values, primary planning action, and secondary administrative actions.

- [x] **Step 3: Simplify the group area**

Add a section heading and preserve group/subgroup controls inside responsive cards.

- [x] **Step 4: Run focused and full verification**

Run the focused test, full Vitest suite, `npm run build`, and `git diff --check`.

### Task 3: Publish production assets

**Files:**
- Modify: generated root `index.html` and hashed files under `assets/`.

**Interfaces:**
- Consumes: successful `npm run build` output.
- Produces: deployable assets retrievable by `git pull origin main`.

- [x] **Step 1: Review generated asset references**

Confirm `index.html` references files that exist under `assets/`.

- [x] **Step 2: Commit source, tests, plan, and generated assets**

Commit only the files related to this UI change.

- [x] **Step 3: Push `main` and verify tracking state**

Push to `origin/main`; confirm local `HEAD` and `origin/main` resolve to the same commit.

# Phase 4 Business Rules Specification: Distribution Management & Lifecycle

## Executive Summary
This document specifies the business rules for Phase 4 of the Clinical Distribution Engine, focusing on the human-in-the-loop workflows required *after* automated candidate generation (Phase 3B). It details how distributions are reviewed, manually overridden, resolved for conflicts, approved, and eventually published. 

This is a **specifications document only**. Several critical workflows (such as approval chains and hard-constraint override policies) are not fully detailed in the underlying database schemas or existing permissions, and require explicit Clinical Department decisions before Phase 4 implementation can begin.

## Source-of-Truth Analysis
**Documents Analyzed:**
1. Approved ERD (`student_clinical_assignments`, `distribution_versions`, `distribution_conflicts`).
2. Source Code & Architecture (`DistributionGenerationService`, `PermissionSeeder`).
3. Phase 3B Documentation (`PHASE_3B_3_BUSINESS_RULES_SPEC.md`, `PHASE_3B_FINAL_INTEGRATION_AUDIT.md`).

**Key Architectural Facts:**
- **Assignments are Individual**: While the algorithm operates on subgroups, the database explicitly persists at the `student_id` level (`student_clinical_assignments`), proving that individual student exceptions/overrides are architecturally intended.
- **Multiple Versions Allowed**: `distribution_versions` is scoped to `rotation_id`, allowing infinite side-by-side versions.
- **Status Enum**: The database strictly supports `['draft', 'suggested', 'manual', 'published']` for version status.
- **Granular Permissions**: The `PermissionSeeder` contains distinct actions for: `view`, `create`, `generate`, `update`, `validate`, `approve`, `publish`.

## Current Lifecycle
Based purely on the existing schema and Phase 3B implementations:
- `draft`: An empty or manually initialized shell version awaiting assignments.
- `suggested`: An untouched, mathematically valid output generated directly by the `DistributionGenerationService`.
- `manual`: The state assumed by a `suggested` or `draft` version once an administrator begins making human modifications using the UI.
- `published`: The finalized state, visible to students and supervisors.

## Manual Override Rules
**Source-Supported Rules:**
- **Individual Student Reassignment**: ALLOWED. The schema (`student_clinical_assignments.student_id`) independently supports modifying a single student's block/site/supervisor without altering their subgroup.
- **Supervisor Assignment**: ALLOWED. The automated algorithm ignores supervisors, leaving `supervisor_id` explicitly null for administrators to populate manually.
- **Requires Permission**: ALLOWED. Any modifications require the `distribution.update` permission.
- **Subgroup Reassignment**: ALLOWED. This is functionally just a bulk-update of all students sharing a `student_subgroup_id`.

**BUSINESS DECISION REQUIRED:**
- Does modifying a student's assignment require them to be formally removed from their Subgroup (setting `student_subgroup_id = null`), or do they keep the subgroup tag but have divergent sites?
- Are supervisors assigned per subgroup, or per individual student?

## Hard Constraint Override Rules
**Source-Supported Rules:**
- The schema contains a `distribution_conflicts` table expressly designed to link a constraint violation (`rule_code`) to a `distribution_version_id`. This implies the system is architected to save a state *even if it contains conflicts*, logging them for review rather than fatally rejecting the save.

**BUSINESS DECISION REQUIRED:**
- Which roles are authorized to save an assignment that actively violates a site's `max_students` capacity?
- Are users required to input a justification/reason string when explicitly overriding a capacity or eligibility constraint?
- Should a `published` distribution forcefully reject any hard-constraint violations, ensuring only 100% compliant versions reach the student body?

## Distribution Version Lifecycle
**Proposed Flow:**
1. **Generation**: System creates `suggested` version.
2. **Review/Edit**: User with `distribution.update` makes edits, changing status to `manual`.
3. **Approval**: User with `distribution.approve` signs off. (Status update required—see Decisions).
4. **Publishing**: User with `distribution.publish` finalizes, changing status to `published`.

**BUSINESS DECISION REQUIRED:**
- There is no `approved` status in the `distribution_versions.status` ENUM (only `draft`, `suggested`, `manual`, `published`). Does an approval merely log an event, or should the ENUM be updated via a migration to include `approved`?
- Is a `published` version strictly immutable, or can an administrator revert it to `manual`?

## Approval Workflow
**Source-Supported Rules:**
- The `distribution.approve` and `distribution.publish` permissions are distinctly separated.

**BUSINESS DECISION REQUIRED:**
- What is the exact organizational chain of command? E.g., Does the Clinical Department Director *approve* the manual version, and the Vice Dean/Dean *publish* it? 
- Can an approval be rejected, sending the version back to the `manual` state?

## Role & Permission Matrix
*Proposed mapping based on standard enterprise roles. Requires approval.*

| Role | View | Generate | Edit/Override | Validate | Approve | Publish |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **System Admin** | X | X | X | X | X | X |
| **Clinical Director**| X | X | X | X | X |   |
| **Vice Dean** | X |   |   | X | X | X |
| **Dean** | X |   |   |   | X | X |
| **Supervisor** | X (Own) |   |   |   |   |   |

## Audit Trail Requirements
**Source-Supported Rules:**
- The `PermissionSeeder` includes an `audit.view` permission, implying an upcoming system-wide audit logging architecture.

**BUSINESS DECISION REQUIRED:**
- When an override is performed, do we rely on a generic system-wide activity log (e.g., Spatie Activitylog), or does the Clinical Department require a dedicated `distribution_edit_logs` table tracking `old_site_id` -> `new_site_id` with a required `reason` column?

## Conflict Management
**Source-Supported Rules:**
- Conflicts are stored in `distribution_conflicts`. Currently, Phase 3B populates this when the algorithm gives up on an impossible subgroup (`UNASSIGNABLE`).

**BUSINESS DECISION REQUIRED:**
- When an administrator makes a manual edit in the UI, should the frontend instantly trigger the backend `ValidationService` and forcefully insert new `distribution_conflicts` if the edit violates capacity? 
- Or are manual conflicts visually highlighted in the UI but not persisted to the database?

## Publishing Rules
**BUSINESS DECISION REQUIRED:**
- Does the act of Publishing immediately trigger notifications (emails/SMS) to the affected students and supervisors?
- Are supervisors allowed to see `suggested` distributions, or only `published` ones?

## Version Comparison
**BUSINESS DECISION REQUIRED:**
- Do administrators need a visual diff tool to compare "Version A" against "Version B" to see exactly which students were moved before clicking Approve? If yes, this is a significant frontend/backend feature that must be scoped into Phase 4.

## Data Integrity Rules
- **Duplicate Prevention**: Manual overrides MUST respect the database's `UNIQUE(student_id, rotation_block_id, distribution_version_id)` constraint. The backend update API must enforce atomic swaps (e.g., removing the old assignment and creating the new one simultaneously) to avoid unique constraint violations during transit.
- **Orphan Prevention**: Deleting a Version must natively cascade to destroy all its `student_clinical_assignments` and `distribution_conflicts`.

## Future Frontend Requirements
Phase 4 will require the following UI components:
1. **Distribution Dashboard**: List all versions for a rotation, showing status, conflict counts, and assignment percentages.
2. **Version Workbench**: A robust data-grid mapping Students/Subgroups against Blocks.
3. **Manual Override Modal**: A tool to select a student, pick a new site/block, assign a supervisor, and execute the move.
4. **Conflict Panel**: A drawer displaying all current violations for the active version.
5. **Approval/Publishing Flow**: A timeline or status bar allowing authorized users to click "Submit for Approval" or "Publish".

## Reporting Requirements
The `reports.view` and `reports.export` permissions imply the need for:
- Student-facing printable schedules.
- Supervisor-facing rosters per site/block.
- Administrative master matrix exports (Excel/PDF).

## Security Requirements
- All API endpoints modifying assignments must strictly verify the user possesses `distribution.update`.
- Endpoints must protect against Cross-Tenant or Cross-Rotation injection (e.g., moving a student into a rotation they are not enrolled in).

## Business Decisions Required (Summary)
1. **ENUM Update**: Does the `distribution_versions` table need an `approved` status added?
2. **Override Justifications**: Are text reasons strictly required for hard-constraint overrides?
3. **Immutability**: Is a published distribution strictly locked?
4. **Approval Chain**: Who explicitly approves, and who explicitly publishes?
5. **Comparison Tools**: Is a Version-vs-Version visual diff required for MVP?
6. **Supervisor Scope**: Are supervisors assigned broadly to subgroups or granularly to individual students?

## Recommended Phase 4 Implementation Sequence
1. **Phase 4A**: Core CRUD endpoints for manual assignment modification & Supervisor linking.
2. **Phase 4B**: Real-time conflict re-validation on manual edits.
3. **Phase 4C**: Status lifecycle API (Draft -> Manual -> Approve -> Publish).
4. **Phase 4D**: Audit logging and Comparison (if required).
5. **Phase 4E**: Frontend Development.

## Final Readiness Assessment
Phase 3B has successfully built a structurally sound foundation. However, **Phase 4 CANNOT commence** until the Clinical Department explicitly answers the Business Decisions Required above, as these answers dictate whether database migrations (e.g., ENUM updates, Audit tables) or complex workflow state-machines are required. 

**VERDICT: PENDING CLINICAL DEPARTMENT REVIEW**

# Phase 3B-3 Business Rules Specification

## 1. Executive Summary
This document provides a strict, source-supported analysis of the business rules, constraints, and operational parameters required to implement the Clinical Distribution Engine in Phase 3B-3. It extracts requirements directly from the approved Clinical Department ERD and current Phase 3B-2 implementation, explicitly highlighting areas where business decisions are required before algorithmic logic can be written.

## 2. Assignment Granularity
- **CURRENT IMPLEMENTATION:** Phase 3B-2 validation endpoints accept `subgroup_id` for assignments.
- **SOURCE-OF-TRUTH:** The ERD's `student_clinical_assignments` table contains foreign keys for BOTH `student_id` and `subgroup_id`.
- **OPEN DECISION:** Must the engine move entire subgroups together as rigid units, generating identical individual `student_clinical_assignments` for all members? Can students be individually split from their subgroup for manual overrides or specific rotation blocks?

## 3. Capacity Rules
- **Capacity Owner:** `site_capacity_rules` table.
- **Capacity Dimension:** Maximum concurrent/total students.
- **Rotation Relationship:** Scoped per Rotation (`rotation_id`).
- **Block Relationship:** NONE (No `block_id` in capacity rules).
- **Department Relationship:** Implicit via the Rotation.
- **Training Site Relationship:** Scoped per Site (`site_id`).
- **Supervisor Relationship:** NONE defined in the ERD for capacity.
- **Hard or Soft:** Currently validated as a hard constraint in Phase 3B-2.
- **OPEN DECISION:** Because there is no `block_id` in `site_capacity_rules`, does `max_students` limit the total number of students at that site over the *entire* rotation, or is it a concurrent limit at any given time (block)?

## 4. Supervisor Assignment
- **CURRENT IMPLEMENTATION:** Validation ensures a supervisor is linked to the site via `primary_site_id`.
- **SOURCE-OF-TRUTH:** 
  - `student_clinical_assignments` table contains a `supervisor_id` FK (assigning a specific supervisor to an individual student).
  - ERD includes a `supervisor_availability` table (`staff_id`, `academic_year_id`).
- **OPEN DECISION:** Should the automatic distribution engine assign supervisors to students directly, or is supervisor assignment a manual post-processing step done by the Training Site coordinator?

## 5. Hard Constraints
| Rule | Source | Current Implementation | Status |
| :--- | :--- | :--- | :--- |
| **No Overlapping Blocks** | Domain Standard | `DistributionConflictService` rejects overlapping blocks | Implemented |
| **Academic Year Mismatch** | ERD / Data Model | `DistributionEligibilityService` validates subgroup/rotation years | Implemented |
| **Invalid Site for Rotation** | ERD `site_capacity_rules` | `DistributionCompatibilityService` restricts to authorized sites | Implemented |
| **Capacity Exceeded** | ERD `site_capacity_rules` | `DistributionCapacityService` aggregates subgroup sizes | Implemented |

## 6. Soft Constraints
- **SOURCE-OF-TRUTH:** The ERD explicitly defines a `distribution_conflicts` table with the note: "Hard/soft conflicts".
- **FINDING:** NO SOURCE-SUPPORTED SOFT CONSTRAINT IDENTIFIED explicitly in the data dictionary or workbook (e.g., "prefer site close to student's home" or "balance gender in subgroups").
- **OPEN DECISION:** What specific soft constraints does the engine need to evaluate and log to the `distribution_conflicts` table?

## 7. Scoring
- **SOURCE-OF-TRUTH:** There are no fields in `distribution_versions` or associated tables for a "score", "fitness", or "optimization metric".
- **FINDING:** SCORING RULE REQUIRES BUSINESS DECISION. Should the engine attempt to "optimize" based on a fitness score, or simply find the first valid distribution that satisfies all Hard Constraints?

## 8. Distribution Lifecycle
- **SOURCE-OF-TRUTH:** `distribution_versions.status` enum supports: `draft`, `suggested`, `manual`, `published`.
- **OPEN DECISION:** 
  - Who has the authority to transition a version to `published`?
  - Does publishing a version lock it immutably, or can a published version be reverted to `manual`/`draft`?

## 9. Manual Overrides
- **SOURCE-OF-TRUTH:** The existence of a `manual` status and the `student_id` field in `student_clinical_assignments` strongly implies manual intervention is supported.
- **OPEN DECISION:** Can an administrator save a `manual` distribution that actively violates a hard capacity rule? (e.g., forcing a 11th student into a site with a max capacity of 10).

## 10. Conflict Handling
- **SOURCE-OF-TRUTH:** The ERD provides a `distribution_conflicts` table linked to `distribution_version_id`.
- **FINDING:** The architecture allows the engine to save a `suggested` distribution *even if it contains conflicts*, logging those issues into `distribution_conflicts` for a human to resolve.
- **OPEN DECISION:** When the engine hits a constraint it cannot resolve, should it:
  1. Abort completely (rollback)?
  2. Leave the student/subgroup unassigned and log a conflict?
  3. Assign them anyway (violating the constraint) and log a conflict?

## 11. Regeneration
- **SOURCE-OF-TRUTH:** Multiple `distribution_versions` can exist for a single `rotation_id`.
- **OPEN DECISION:** When a user requests the engine to run again, does it:
  1. Create a brand new `distribution_version` (Version 2)?
  2. Overwrite the existing `draft`/`suggested` version?
  3. Do we need to carry over `manual` overrides from Version 1 into Version 2?

## 12. Unassigned Students
- **SOURCE-OF-TRUTH:** Not explicitly modeled. An unassigned student simply lacks a `student_clinical_assignments` record for that rotation block.
- **OPEN DECISION:** Should the engine explicitly create "Unassigned" placeholder records, or is absence of a record sufficient?

## 13. Source-of-Truth Traceability
| Rule | Source | Sheet/Section | Current Implementation | Decision Required |
|------|--------|---------------|------------------------|-------------------|
| Distribution Versions | ERD | Tables (`distribution_versions`) | Phase 3B-2 Migration | Lifecycle & Publishing permissions |
| Assignments | ERD | Tables (`student_clinical_assignments`) | None (Pending 3B-3) | Granularity (Subgroup vs Student) |
| Conflicts | ERD | Tables (`distribution_conflicts`) | None (Pending 3B-3) | Handling behavior & Soft Constraints |
| Capacity Limits | ERD | Tables (`site_capacity_rules`) | Phase 3B-2 Capacity Service | Block vs Rotation scope |
| Supervisor Linking | ERD | Tables (`supervisor_availability`) | Phase 3B-2 Compatibility Service | Is auto-assignment required? |

## 14. Open Business Decisions
1. **Assignment Granularity:** Subgroup bulk movement vs. individual student routing.
2. **Capacity Scope:** Is `max_students` a concurrent block limit or a total rotation limit?
3. **Supervisor Assignment:** Does the engine map supervisors, or is this manual?
4. **Scoring:** Does an optimization metric exist?
5. **Conflict Strategy:** Abort vs. partial assignment vs. constraint violation logging.

## 15. Recommended Decisions Requiring Clinical Department Approval
To proceed with building the algorithmic engine in Phase 3B-3, the Clinical Department must approve the following assumptions (or provide corrections):
1. **Granularity:** The engine will assign whole Subgroups to blocks/sites. Individual students will inherit these subgroup assignments.
2. **Capacity:** The engine will treat `max_students` as a **concurrent limit per block**. (If 10 students are allowed, Block 1 can have 10, and Block 2 can have a different 10).
3. **Conflicts:** If the engine cannot find a valid slot for a subgroup, it will leave them unassigned and write a record to `distribution_conflicts`.
4. **Regeneration:** Generating a distribution creates a *new* `suggested` version, leaving older versions intact for comparison.

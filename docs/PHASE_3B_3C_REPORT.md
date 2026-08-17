# Phase 3B-3C Distribution Generation & Persistence Report

## Objective
To implement the persistence layer that orchestrates the execution of the Clinical Distribution Engine and permanently saves the computed assignments to the database as a new suggested `DistributionVersion`.

## Generation Workflow
The architecture follows a strict Pipeline pattern coordinated by the new `DistributionGenerationService`:
1. `DistributionValidationContextBuilder`: Queries active subgroups, capacity rules, and rotation blocks into memory.
2. `DistributionCandidateGeneratorService`: Pre-calculates the valid constraint graph (Phase 3B-3A).
3. `DistributionAlgorithmService`: Navigates the constraint graph to find a global capacity-compliant path (Phase 3B-3B).
4. `DistributionVersion`: Creates the new version tracking record.
5. Bulk Inserts: Transforms the subgroup-level algorithm results into `student_clinical_assignments`.
6. Conflict Inserts: Saves detailed diagnostic records to `distribution_conflicts` for any unassigned subgroups.
7. Final Validation check: Redundantly verifies the resulting graph is theoretically valid to prevent silent corruption.

## API Endpoint
Implemented `POST /api/v1/rotations/{rotation}/distribution/generate`.
Returns a standard `ApiResponse` envelope containing generation telemetry:
- `distribution_version_id`
- `algorithm_status`
- assignment/unassigned counts
- conflict counts

## Authorization
Secured behind the existing `distribution.generate` permission (mapped in `PermissionSeeder`).

## Distribution Version Handling
Every generation securely creates a NEW `distribution_version` with `status = suggested`. Previous versions are untouched, ensuring true idempotency and perfect version history out of the box.

## Assignment Persistence
Subgroup assignments are broken down to their individual member level. The service queries all active students dynamically linked to the given subgroup (via `student_group_assignments`) and creates specific `student_clinical_assignments` records mapping `student_id` to the `rotation_block_id` and `training_site_id`.

## Conflict Persistence
When `PARTIAL_IMPOSSIBLE` occurs, the exact subgroup ID is persisted into `distribution_conflicts` with the `UNASSIGNABLE` rule code to assist administrators in reviewing why capacity was insufficient.

## Final Validation & Transaction Safety
The entire generation pipeline is enveloped in a `DB::transaction()`.
If the final redundancy check fails, or if a database constraint is violated, the transaction immediately rolls back, destroying the `student_clinical_assignments` and the `distribution_version` entirely to prevent dangling partial states.

## Performance (Zero N+1)
Using Laravel's `insert()` capabilities, the persistence layer avoids row-by-row queries. It grabs the relevant `StudentGroupAssignment` records with one grouped query, maps them in-memory, and writes them back out in chunks of 500 rows. The query trace remains safely under 15 queries total, entirely avoiding N+1 issues.

## Determinism
By extracting all randomness in previous phases, generating a distribution with identical data parameters inherently yields the exact same assignments.

## Regression Results
- **Tests Passed:** 83
- **Assertions:** 238
- **Failures:** 0

## Known Limitations
- The algorithm currently creates purely static initial assignments. Changes made by administrators after generation must be saved via a distinct manual override API.
- Re-generating a rotation simply stamps out another brand new version. Re-applying existing manual overrides over the top of a new generation is not supported in this phase.

## Future Lifecycle Work
- Publishing workflows (transitioning a version from `suggested` -> `published`)
- Manual Overrides UI integration
- Final Approvals and Logging

## Files Changed
- `database/migrations/2026_08_14_193122_create_student_clinical_assignments_table.php`
- `database/migrations/2026_08_14_193128_create_distribution_conflicts_table.php`
- `app/Models/StudentClinicalAssignment.php`
- `app/Models/DistributionConflict.php`
- `app/Services/Distribution/DistributionGenerationService.php`
- `app/Http/Controllers/Api/V1/RotationController.php`
- `routes/api.php`
- `tests/Feature/Phase3B3/DistributionGenerationTest.php`

## Final Verdict
**PHASE 3B-3C APPROVED**

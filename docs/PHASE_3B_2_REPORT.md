# Phase 3B-2 Report

## Objective
Implement the business-rule and constraint foundation required for the future Clinical Distribution Engine. This phase focused entirely on defining and validating the constraints necessary to ensure proposed student/subgroup distributions are legal, structurally sound, and adhere to defined capacities. No automatic distribution algorithm was built.

## Source-of-Truth References
- Approved Clinical Department Workbook (`بيانات_الدائرة_السريرية_الشاملة (1).xlsx`)
- Phase 3A Data Analysis (`docs/phase-3a-data-analysis.md`)
- Phase 3B-1 Report (`docs/PHASE_3B_1_REPORT.md`)
- Existing ERD mapping for `student_groups`, `rotations`, and `site_capacity_rules`

## Rules Implemented
- **Eligibility:** Verified that a student subgroup belongs to an academic year matching the rotation's academic year, and that the subgroup's group level matches the rotation's required academic level.
- **Compatibility:** Ensured that a proposed rotation block is linked to the active rotation, and that the proposed training site is explicitly permitted for the rotation via `site_capacity_rules`.

## Constraints Implemented
- Subgroups must exist and have a parent group.
- Missing associations (like an unsaved block or unauthorized site) trigger structural violations rather than generic 400 errors, with explicit validation DTOs returned.

## Conflict Detection
- **Duplicate Assignments:** Prevents assigning the same subgroup to the exact same rotation block multiple times.
- **Overlapping Assignments:** Detects and rejects cases where a subgroup is assigned to two different blocks that overlap chronologically (e.g., Week 1-4 overlaps with Week 3-6).

## Capacity Validation
- Aggregates the size of all proposed subgroups assigned to a specific training site in the batch.
- Dynamically counts only the *active students* associated with each subgroup.
- Compares the total proposed capacity against the `site_capacity_rules.max_students` limit for that site and rotation.

## Domain Services
The domain logic was abstracted into strict, testable services located in `App\Services\Distribution`:
- `DistributionEligibilityService`
- `DistributionCompatibilityService`
- `DistributionCapacityService`
- `DistributionConflictService`
- `DistributionValidationService` (Orchestrator returning unified `valid` and `violations` structures)

## API Endpoints
- `POST /api/v1/rotations/{rotation}/validate-distribution`
  - Accepts a JSON array of `CandidateAssignmentDTO` objects.
  - Passes the batch to the `DistributionValidationService`.
  - Returns structured `violations` explaining exactly which rule failed.

## Authorization
- Utilized the existing Phase 2 RBAC.
- Re-used the `distribution.validate` permission (already present in the seeders).
- Endpoint is secured by `middleware('permission:distribution.validate')`.

## Tests
- `DistributionValidationTest.php` covers:
  - Valid assignments
  - Eligibility academic year mismatch
  - Compatibility invalid site
  - Capacity exceeded calculation
  - Conflict overlapping blocks
  - Permission denial (403)
- The complete test suite continues to run flawlessly.

## Regression Results
- Total Tests Run: 71
- Total Assertions Passed: 175
- Pass Rate: 100%

## Open Questions
- **Distribution Scope:** The validation foundation evaluates *subgroups*, but is it expected to handle individual `student_id` assignments directly, or will all individual assignments inherit from subgroup placements?

## Known Limitations
- Supervisor compatibility check ensures a supervisor is linked to the site, but no capacity rule is defined for supervisors yet (source-of-truth currently lacks explicit max-student limits per supervisor).
- Capacity evaluations only check the *proposed* payload since no previous assignments are persistently saved during this phase.

## Files Changed
- `app/DTOs/CandidateAssignmentDTO.php`
- `app/Http/Controllers/Api/V1/RotationController.php`
- `app/Http/Requests/ValidateDistributionRequest.php`
- `app/Models/DistributionVersion.php`
- `app/Services/Distribution/DistributionCapacityService.php`
- `app/Services/Distribution/DistributionCompatibilityService.php`
- `app/Services/Distribution/DistributionConflictService.php`
- `app/Services/Distribution/DistributionEligibilityService.php`
- `app/Services/Distribution/DistributionValidationService.php`
- `database/migrations/2026_08_14_300015_create_distribution_versions_table.php`
- `routes/api.php`
- `tests/Feature/Phase3B2/DistributionValidationTest.php`

## Final Verdict
PHASE 3B-2 APPROVED

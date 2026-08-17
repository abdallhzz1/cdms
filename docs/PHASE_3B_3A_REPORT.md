# Phase 3B-3A Report

## Objective
Implement the first executable layer of the Distribution Engine: **Candidate Generation**. The objective was to deterministically build the complete domain of all possible valid assignment combinations (Subgroup × Rotation Block × Training Site) without selecting the final optimal distribution, respecting all hard constraints configured in previous phases.

## Business Rules Used
1. **Assignment Granularity:** Subgroups are the primary movement unit.
2. **Capacity Limit:** Validated strictly as a concurrent limit per block against the `site_capacity_rules.max_students`.
3. **Hard Constraints:** Academic year eligibility, valid site configuration, and capacity are treated as absolute filters.
4. **Existing Assignments:** Since no final assignments are persisted yet, the generator operates purely as an in-memory space builder.

## Candidate Generation Model
- `CandidateAssignmentDTO`: Reused from Phase 3B-2 to represent a single proposed move.
- `CandidateGenerationResultDTO`: Encapsulates the generator's output into two sets:
  - `valid_candidates`: Array of valid `CandidateAssignmentDTO`s.
  - `rejected_candidates`: Array detailing the rejected candidate and the precise `violations` blocking it.

## Deterministic Ordering
To ensure absolute determinism across all runs (critical for reproducible algorithms later):
- Subgroups are ordered by `id`.
- Blocks are ordered by `from_week`, then `id`.
- Site Capacity Rules are ordered by `site_id`.

## Services Reused
The `DistributionCandidateGeneratorService` strictly reuses the existing `DistributionValidationService` to test each candidate in isolation. No business logic (e.g., capacity comparison math, year checking) was duplicated.

## API
A read-only, idempotent endpoint was exposed to allow programmatic access to the candidate space:
- **Route:** `GET /api/v1/rotations/{rotation}/distribution/candidates`
- **Security:** Requires `distribution.validate` permission.
- **Output:** Returns standard `ApiResponse::success()` containing `valid_candidates` and `rejected_candidates`.

## Tests
Created `DistributionCandidateGeneratorTest` covering:
- Building the complete valid/invalid matrix accurately.
- Ignoring ineligible subgroups.
- Rejecting subgroups whose size exceeds the block's site capacity.
- Ensuring deterministic sorting.
- Validating the 403 Forbidden permission boundary.

## Regression Results
- **Total Tests:** 73
- **Total Assertions:** 195
- **Failures:** 0
- **Status:** PASS

## Known Limitations
The generator currently builds candidate tuples individually. When passed to the optimizer, the optimizer will be responsible for evaluating *combination conflicts* (e.g., Subgroup A and Subgroup B both picking Site 1 in Block 1 and exceeding the capacity together). The generator guarantees that *individually*, every move in `valid_candidates` is legal.

## Open Questions
- Will the final algorithm run completely in memory recursively, or will it iteratively flush "Suggested" partial assignments to the database?

## Files Changed
- `app/DTOs/CandidateGenerationResultDTO.php`
- `app/Http/Controllers/Api/V1/RotationController.php`
- `app/Services/Distribution/DistributionCandidateGeneratorService.php`
- `routes/api.php`
- `tests/Feature/Phase3B3/DistributionCandidateGeneratorTest.php`

## Final Verdict
PHASE 3B-3A APPROVED

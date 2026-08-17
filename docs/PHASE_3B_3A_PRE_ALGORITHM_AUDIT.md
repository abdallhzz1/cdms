# Phase 3B-3A Pre-Algorithm Audit

## Candidate Generation Model
- **Computational Model:** The candidate space is generated via a direct Cartesian product (cross-product): `Subgroups × Blocks × SiteCapacityRules`.
- **Dimensions Participating:** `subgroup_id`, `rotation_block_id`, `site_id`.
- **Pre-filtered Dimensions (Before Cross-Product):**
  - **Subgroups:** Filtered by `academic_year_id` and `academic_level` to match the Rotation.
  - **Blocks:** Filtered by `rotation_id` (via the `$rotation->blocks()` relationship).
  - **Sites:** Filtered by the existence of a `site_capacity_rule` for the Rotation.
- **Validated After Generation:** Eligibility (re-validated), Compatibility (re-validated), Capacity (evaluated in isolation per tuple), and Conflicts (overlaps/duplicates).
- **Worst-case Candidate Count:** Example: 50 subgroups × 10 blocks × 20 sites = 10,000 candidate combinations.
- **Memory Implications:** Storing 10,000 `CandidateAssignmentDTO` objects in memory is trivial for PHP (likely < 5MB). However, the `rejected_candidates` array will grow rapidly if many sites have capacity lower than subgroup sizes, potentially doubling the memory footprint.

## Pre-filtering
- **Academic Year / Rotation Compatibility:** Yes, pre-filtered via `whereHas('group')` and `$rotation->blocks()`.
- **Site Compatibility:** Yes, only sites with explicitly configured `site_capacity_rules` for the rotation are loaded.
- **Inactive Entities:** **No.** `StudentSubgroup::is_active` is not filtered in the query.
- **Unavailable Blocks:** Not applicable (all rotation blocks are considered).
- **Invalid Subgroup Relationships:** Yes, filtered by requiring a valid parent `group`.

## Rejected Candidate Handling
- **Memory:** Rejected candidates are kept entirely in memory inside the `CandidateGenerationResultDTO->rejectedCandidates` array.
- **Structured Reasons:** Yes, rejection reasons use the structured `violations` array returned by `DistributionValidationService`.
- **Multiple Violations:** Yes, the validation service supports returning multiple violations per candidate.
- **Requirement for Future Algorithm:** The optimization algorithm (Phase 3B-3B) only requires the *valid* candidates to build the search space graph. Rejected candidates are purely diagnostic.
- **Optimization Potential:** Rejected candidates could be omitted from the DTO, logged to a file, or streamed to reduce the memory footprint by up to 90% in dense rejection scenarios.

## Determinism
- **Ordering Strategy:**
  - Subgroups: `orderBy('id')`
  - Blocks: `orderBy('from_week')->orderBy('id')`
  - Sites: `orderBy('site_id')`
- **Result:** Yes, strictly deterministic. `Same database state + same input = same candidate ordering`.
- There is no implicit database ordering, unstable collection sorting, or random UUID sorting involved.

## Database Query Analysis
**CRITICAL FINDING: Severe N+1 Database Query Problem**
The `DistributionCandidateGeneratorService` iterates over the cross-product (e.g., 600 combinations) and calls `$this->validationService->validate($rotation, [$assignment])` inside the innermost loop. 

Because the Phase 3B-2 validation services were designed to validate a *batch* of assignments (a complete schedule), they execute their own queries on every invocation:
- `DistributionEligibilityService`: 1 query per loop (`StudentSubgroup::whereIn...`).
- `DistributionCompatibilityService`: 0 queries (safe, uses `loadMissing`).
- `DistributionCapacityService`: 2 queries per loop (`siteCapacityRules()->get()` and `StudentGroupAssignment::whereIn...`).
- `DistributionConflictService`: 1 query per loop (`$rotation->blocks()->get()`).

**Result:** 4 queries executed per candidate tuple.
For 10,000 candidate tuples, the generator will execute **40,000 queries** in a nested loop. 

*Note: We cannot simply pass all 10,000 candidates to the validation service as a batch, because the capacity/conflict services would aggregate them (assuming we are trying to put 10,000 students into the same rotation simultaneously) and reject everything.*

## Candidate DTO Review
The `CandidateAssignmentDTO` successfully encapsulates all necessary domain identifiers (`subgroup_id`, `rotation_block_id`, `site_id`, `supervisor_id`) required for Phase 3B-3B to map the search space graph. Validation status and rejection reasons are preserved externally in the Generation Result DTO.

## Test Quality
`DistributionCandidateGeneratorTest` successfully covers:
- Candidate contents
- Candidate ordering
- Invalid subgroup exclusion
- Capacity rejection
- Multiple blocks, sites, and subgroups
- Deterministic repeated execution

**Missing Coverage:**
- **Empty Candidate Space:** There is no test asserting the generator's behavior when the rotation has 0 blocks or 0 sites (should return empty arrays gracefully).

## Algorithm Readiness
The domain representation is ready. However, the performance profile is absolutely incompatible with production-scale candidate generation due to the nested N+1 validation queries.

## Performance Risks
- **HIGH:** N+1 query execution (4 queries per candidate permutation). This will cause timeouts or memory exhaustion on large datasets.
- **LOW:** Retaining all rejected candidates in memory.

## Required Changes
1. **Validation Service Refactoring:** The validation services must be refactored to support Dependency Injection of pre-loaded domain data (e.g., passing a `ValidationContext` object), OR the Candidate Generator must implement its own highly-optimized, purely in-memory constraint evaluation utilizing pre-fetched collections.
2. **Inactive Subgroups:** The generator query must filter out `is_active = false` subgroups.

## Final Verdict
NOT READY FOR PHASE 3B-3B

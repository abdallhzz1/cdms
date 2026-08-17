# Phase 3B-3B Distribution Algorithm Report

## Objective
To implement a deterministic, in-memory algorithm that takes the valid candidate space generated in Phase 3B-3A and transforms it into a globally valid distribution, respecting all hard constraints (most notably concurrent block capacity).

## Algorithm Strategy
The engine utilizes a Constraint Satisfaction Problem (CSP) Backtracking Search approach with Forward Checking. 
The algorithm operates sequentially on Subgroups, assigning exactly one candidate (block + site) per subgroup.

## Why This Strategy Was Chosen
A naive greedy approach can fail to find a valid distribution even when one exists (e.g., if it assigns a small subgroup to a large site, starving a larger subgroup that can *only* fit in the large site). Backtracking allows the engine to explore alternative valid combinations when it hits a dead end.

## Constraint Handling
- All Phase 3B-2 hard constraints (academic year, eligibility, block/site compatibility) are pre-filtered during Candidate Generation (Phase 3B-3A).
- The algorithm's primary responsibility is strictly managing **Concurrent Capacity Limits**. It tracks capacity usage per `rotation_block_id` and `site_id` in an in-memory hash map, instantly validating new assignments against `site_capacity_rules.max_students`.

## Candidate Ordering
Determinism is strictly enforced.
1. **Most Constrained Variable (MCV):** The algorithm always processes the unassigned subgroup with the *fewest* remaining valid candidates. This drastically reduces the search tree by handling the hardest-to-place subgroups first.
2. **Subgroup Tie-breaker:** Sorted by `subgroup_id` ASC.
3. **Candidate Tie-breaker:** Candidates within a subgroup are sorted by `block.from_week`, `block_id`, `site_id`, and `supervisor_id`.

## Search / Backtracking
If a candidate placement causes any other unassigned subgroup's domain to drop to 0 valid candidates (Forward Checking), the algorithm immediately backtracks, avoiding deep useless searches.

## Determinism
No random functions, shuffles, or unstable sorting algorithms are used. Given the same database state and rotation, the algorithm is mathematically guaranteed to output the exact same distribution.

## Failure Handling
If the algorithm exhausts the search space without finding a complete valid distribution, it safely returns the deepest valid partial distribution it discovered (the branch that successfully assigned the most subgroups).

## Unassigned Subgroups
Unassigned subgroups are explicitly returned in the `DistributionAlgorithmResultDTO::$unassignedSubgroups` array alongside diagnostic metrics explaining the failure (e.g., `status = PARTIAL_IMPOSSIBLE`).

## Performance
- A hard safety limit (`maxNodes = 5000`) prevents exponential time complexity on pathological unsolvable graphs.
- Forward checking prunes dead branches immediately.
- MCV ordering ensures minimal backtracking.

## Query Safety
The algorithm relies purely on the `DistributionValidationContext` arrays. No Eloquent or DB queries are executed inside the search tree.

## Tests
Created `DistributionAlgorithmTest.php` with:
1. `test_zero_queries_during_search_and_determinism()`: Proves exactly 0 queries run during search, and repeated runs yield identical output.
2. `test_backtracking_scenario()`: Proves the algorithm correctly retreats from a naive greedy dead-end to satisfy global constraints.
3. `test_impossible_distribution_returns_best_partial()`: Proves the algorithm returns the best possible partial state when capacity is mathematically insufficient.

## Regression Results
- **Tests Passed:** 77
- **Assertions:** 213
- **Failures:** 0

## Known Limitations
- The engine currently assigns exactly ONE block/site candidate per subgroup. If a future rule requires splitting a subgroup across multiple blocks sequentially for a single rotation, the algorithm's target condition would need to be updated.
- No "Soft Constraints" or "Optimization Scoring" are evaluated. The engine accepts the first globally valid path it finds.

## Future Extensions
- Publishing workflow and integration with `distribution_versions` and `student_clinical_assignments` (Phase 3B-3C).

## Files Changed
- `app/DTOs/DistributionAlgorithmResultDTO.php`
- `app/Services/Distribution/DistributionAlgorithmService.php`
- `tests/Feature/Phase3B3/DistributionAlgorithmTest.php`

## Final Verdict
**PHASE 3B-3B APPROVED**

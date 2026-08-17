# Phase 3B-3A Performance Remediation

## The Problem
A pre-algorithm audit identified a severe N+1 Database Query Problem in `DistributionCandidateGeneratorService`. The generator was exploring the Cartesian product of Subgroups × Blocks × Sites (e.g., 600+ permutations) and validating each tuple individually using `DistributionValidationService`. Because the validation services queried the database independently (fetching blocks, capacity rules, subgroups, and student counts), the generator executed ~4 queries *per candidate*. A realistic rotation of 10,000 combinations would trigger 40,000 queries in a nested loop, leading to immediate database timeouts.

Additionally:
- `StudentSubgroup::is_active` was not filtered, meaning inactive subgroups were being considered for assignment.
- `DistributionCapacityService` had a latent bug in Phase 3B-2 where it aggregated student capacities across all blocks simultaneously, instead of treating `site_capacity_rules.max_students` as a concurrent limit *per rotation block*.

## The Solution
We refactored the entire validation layer to use an in-memory Context object (`DistributionValidationContext`) pre-populated by a Context Builder (`DistributionValidationContextBuilder`).

### 1. `DistributionValidationContext`
A lightweight DTO that stores pre-fetched Collections:
- `$rotation`
- `$blocks`
- `$capacityRules`
- `$subgroups`
- `$subgroupSizes`

### 2. Context Builder
Two distinct builder methods were implemented to isolate query patterns:
- `buildForGeneration(Rotation)`: Used by the Generator. Pre-loads all eligible, active subgroups, their active student counts, and all rotation blocks and capacity rules. (Executes ~4 flat queries total).
- `buildForValidation(Rotation, array $assignments)`: Used by the API validation endpoint. Pre-loads only the specific subgroups/blocks/rules referenced in the payload.

### 3. Service Refactoring
The 4 core validation services (`Eligibility`, `Compatibility`, `Capacity`, `Conflict`) were updated to accept the `DistributionValidationContext` instead of executing Eloquent queries. 

### 4. Capacity Bug Fix
`DistributionCapacityService` was updated to group capacity calculations concurrently by `$rotation_block_id` and `$site_id` rather than just `$site_id`, successfully enforcing the business rule that site capacity is a per-block limit.

## Performance Verification
A new test (`test_generator_avoids_n_plus_one_queries`) was added utilizing Laravel's `DB::getQueryLog()`. With 40 candidate permutations, the previous architecture would have executed ~160 queries. The new architecture executes exactly **4 queries**, guaranteeing `O(1)` query complexity for the generator regardless of the candidate space size.

## Test Results
- **Total Tests:** 74
- **Total Assertions:** 198
- **Failures:** 0
- **Regression:** Complete pass rate across Phase 3A, 3B-1, 3B-2, and 3B-3A.

## Final Verdict
**READY FOR PHASE 3B-3B**

<?php

namespace App\Services\Distribution;

use App\DTOs\CandidateAssignmentDTO;
use App\DTOs\CandidateGenerationResultDTO;
use App\DTOs\DistributionAlgorithmResultDTO;
use App\Models\Rotation;

class DistributionAlgorithmService
{
    private int $nodesExplored = 0;
    private int $maxNodes = 5000;
    private ?array $bestPartialAssignment = null;
    private int $bestAssignedCount = -1;
    private bool $limitReached = false;
    private DistributionValidationContext $context;

    public function execute(
        Rotation $rotation,
        DistributionValidationContext $context,
        CandidateGenerationResultDTO $candidateSpace
    ): DistributionAlgorithmResultDTO {
        $this->context = $context;
        $this->nodesExplored = 0;
        $this->bestPartialAssignment = null;
        $this->bestAssignedCount = -1;
        $this->limitReached = false;

        // Group valid candidates by subgroup_id
        $candidatesBySubgroup = [];
        foreach ($context->subgroups as $subgroupId => $sg) {
            $candidatesBySubgroup[$subgroupId] = [];
        }

        foreach ($candidateSpace->validCandidates as $candidate) {
            $candidatesBySubgroup[$candidate->subgroup_id][] = $candidate;
        }

        // Initial capacity state: [blockId][siteId] => current capacity usage
        $capacityUsage = [];

        // Identify subgroups that have NO valid candidates at the root (unassignable)
        $unassignableSubgroupIds = [];
        $assignableSubgroups = [];
        
        foreach ($candidatesBySubgroup as $subgroupId => $candidates) {
            if (empty($candidates)) {
                $unassignableSubgroupIds[] = $subgroupId;
            } else {
                $assignableSubgroups[$subgroupId] = $candidates;
            }
        }

        // Start Backtracking Search
        $assigned = $this->search($assignableSubgroups, [], $capacityUsage);

        // If search returned null, it exhausted all paths without a full valid distribution,
        // so we fall back to the best partial distribution found.
        if ($assigned === null) {
            $assigned = $this->bestPartialAssignment ?? [];
        }

        $assignedSubgroupIds = array_map(fn($c) => $c->subgroup_id, $assigned);
        $allSubgroupIds = $context->subgroups->keys()->toArray();
        $finalUnassignedSubgroups = array_diff($allSubgroupIds, $assignedSubgroupIds);
        
        $success = count($assigned) === count($assignableSubgroups) && count($unassignableSubgroupIds) === 0;
        $status = $this->limitReached ? 'SEARCH_LIMIT_REACHED' : ($success ? 'SUCCESS' : 'PARTIAL_IMPOSSIBLE');

        return new DistributionAlgorithmResultDTO(
            success: $success,
            status: $status,
            selectedAssignments: $assigned,
            unassignedSubgroups: array_values($finalUnassignedSubgroups),
            diagnostics: [
                'nodes_explored' => $this->nodesExplored,
                'target_assignments' => count($context->subgroups),
                'achieved_assignments' => count($assigned)
            ]
        );
    }

    /**
     * @param array $unassignedDomains [subgroup_id => CandidateAssignmentDTO[]]
     * @param CandidateAssignmentDTO[] $assigned
     * @param array $capacityUsage [blockId][siteId] => int
     */
    private function search(array $unassignedDomains, array $assigned, array $capacityUsage): ?array
    {
        if ($this->nodesExplored >= $this->maxNodes) {
            $this->limitReached = true;
            return null; // Force abort
        }
        $this->nodesExplored++;

        // Track the best partial assignment found so far
        if (count($assigned) > $this->bestAssignedCount) {
            $this->bestAssignedCount = count($assigned);
            $this->bestPartialAssignment = $assigned;
        }

        if (empty($unassignedDomains)) {
            return $assigned; // All assignable subgroups placed! Success!
        }

        // Forward Checking: Filter domains for remaining subgroups based on current capacity
        $filteredDomains = [];
        foreach ($unassignedDomains as $subgroupId => $candidates) {
            $validForSg = [];
            foreach ($candidates as $candidate) {
                if ($this->hasCapacity($candidate, $capacityUsage)) {
                    $validForSg[] = $candidate;
                }
            }
            if (empty($validForSg)) {
                // Forward checking detected a dead end: a subgroup has 0 valid moves left.
                return null;
            }
            $filteredDomains[$subgroupId] = $validForSg;
        }

        // Most Constrained Variable (MCV): Pick subgroup with fewest valid candidates
        // Sort deterministically to break ties: fewest candidates first, then by subgroup_id
        uasort($filteredDomains, function($a, $b) {
            $countA = count($a);
            $countB = count($b);
            if ($countA === $countB) {
                return 0; // The array keys will be used to break ties if we need to, but let's be explicit
            }
            return $countA <=> $countB;
        });

        // To explicitly tie-break by subgroup_id (keys), we can extract and sort
        $keys = array_keys($filteredDomains);
        usort($keys, function($k1, $k2) use ($filteredDomains) {
            $c1 = count($filteredDomains[$k1]);
            $c2 = count($filteredDomains[$k2]);
            if ($c1 === $c2) {
                return $k1 <=> $k2;
            }
            return $c1 <=> $c2;
        });

        $bestSubgroupId = $keys[0];
        $sgCandidates = $filteredDomains[$bestSubgroupId];

        // Deterministic Value Ordering: block sequence, site_id, department_id, supervisor_id
        $sgCandidates = $this->sortCandidates($sgCandidates);

        foreach ($sgCandidates as $candidate) {
            // Apply assignment
            $newAssigned = $assigned;
            $newAssigned[] = $candidate;

            $newCapacityUsage = $this->addCapacity($candidate, $capacityUsage);

            $newUnassignedDomains = $unassignedDomains;
            unset($newUnassignedDomains[$bestSubgroupId]);

            // Recurse
            $result = $this->search($newUnassignedDomains, $newAssigned, $newCapacityUsage);

            if ($result !== null) {
                return $result; // Found a valid path!
            }

            if ($this->limitReached) {
                return null; // Abort fast if limit hit deeply
            }
        }

        return null; // All candidates for this subgroup led to a dead end. Backtrack.
    }

    private function hasCapacity(CandidateAssignmentDTO $candidate, array $capacityUsage): bool
    {
        $blockId = $candidate->rotation_block_id;
        $siteId = $candidate->site_id;
        $subgroupSize = $this->context->subgroupSizes->get($candidate->subgroup_id, 0);

        $currentUsage = $capacityUsage[$blockId][$siteId] ?? 0;
        $proposedUsage = $currentUsage + $subgroupSize;

        $rule = $this->context->capacityRules->get($siteId);
        
        if ($rule && $rule->max_students !== null && $proposedUsage > $rule->max_students) {
            return false;
        }

        return true;
    }

    private function addCapacity(CandidateAssignmentDTO $candidate, array $capacityUsage): array
    {
        $blockId = $candidate->rotation_block_id;
        $siteId = $candidate->site_id;
        $subgroupSize = $this->context->subgroupSizes->get($candidate->subgroup_id, 0);

        if (!isset($capacityUsage[$blockId])) {
            $capacityUsage[$blockId] = [];
        }
        if (!isset($capacityUsage[$blockId][$siteId])) {
            $capacityUsage[$blockId][$siteId] = 0;
        }
        
        $capacityUsage[$blockId][$siteId] += $subgroupSize;

        return $capacityUsage;
    }

    /**
     * @param CandidateAssignmentDTO[] $candidates
     * @return CandidateAssignmentDTO[]
     */
    private function sortCandidates(array $candidates): array
    {
        usort($candidates, function (CandidateAssignmentDTO $a, CandidateAssignmentDTO $b) {
            $blockA = $this->context->blocks->get($a->rotation_block_id);
            $blockB = $this->context->blocks->get($b->rotation_block_id);
            
            // 1. Block sequence (from_week)
            if ($blockA && $blockB && $blockA->from_week !== $blockB->from_week) {
                return $blockA->from_week <=> $blockB->from_week;
            }
            
            // 2. Block ID
            if ($a->rotation_block_id !== $b->rotation_block_id) {
                return $a->rotation_block_id <=> $b->rotation_block_id;
            }

            // 3. Site ID
            if ($a->site_id !== $b->site_id) {
                return $a->site_id <=> $b->site_id;
            }

            // 4. Supervisor ID (nulls first)
            if ($a->supervisor_id !== $b->supervisor_id) {
                if ($a->supervisor_id === null) return -1;
                if ($b->supervisor_id === null) return 1;
                return $a->supervisor_id <=> $b->supervisor_id;
            }

            return 0;
        });

        return $candidates;
    }
}

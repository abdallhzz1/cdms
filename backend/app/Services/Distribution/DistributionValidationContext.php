<?php

namespace App\Services\Distribution;

use App\Models\Rotation;
use Illuminate\Support\Collection;

class DistributionValidationContext
{
    /**
     * @param Rotation $rotation
     * @param Collection $blocks keyed by id
     * @param Collection $capacityRules keyed by site_id
     * @param Collection $subgroups keyed by id
     * @param Collection $subgroupSizes keyed by subgroup_id
     */
    public function __construct(
        public readonly Rotation $rotation,
        public readonly Collection $blocks,
        public readonly Collection $capacityRules,
        public readonly Collection $subgroups,
        public readonly Collection $subgroupSizes
    ) {}
}

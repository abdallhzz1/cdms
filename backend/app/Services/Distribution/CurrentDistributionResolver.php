<?php

namespace App\Services\Distribution;

use App\Models\DistributionVersion;

class CurrentDistributionResolver
{
    /**
     * Resolves the single authoritative current published DistributionVersion for a rotation.
     * Returns null if no version is currently published and active for the given rotation.
     * 
     * @param int $rotationId
     * @return DistributionVersion|null
     */
    public function resolveForRotation(int $rotationId): ?DistributionVersion
    {
        return DistributionVersion::currentPublishedForRotation($rotationId)->first();
    }
}

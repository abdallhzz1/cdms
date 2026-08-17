<?php

namespace App\DTOs;

class CandidateAssignmentDTO
{
    public function __construct(
        public readonly int $subgroup_id,
        public readonly int $rotation_block_id,
        public readonly int $site_id,
        public readonly ?int $supervisor_id = null
    ) {}

    public static function fromArray(array $data): self
    {
        return new self(
            $data['subgroup_id'],
            $data['rotation_block_id'],
            $data['site_id'],
            $data['supervisor_id'] ?? null
        );
    }
}

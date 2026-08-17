<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\StudentSubgroup */
class StudentSubgroupResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'               => $this->id,
            'student_group_id' => $this->student_group_id,
            'name'             => $this->name,
            'min_size'         => $this->min_size,
            'max_size'         => $this->max_size,
            'is_active'        => $this->is_active,
            'created_at'       => $this->created_at?->toIso8601String(),
        ];
    }
}

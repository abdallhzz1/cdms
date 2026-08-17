<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\StudentGroup */
class StudentGroupResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                   => $this->id,
            'academic_year_id'     => $this->academic_year_id,
            'academic_level'       => $this->academic_level,
            'name'                 => $this->name,
            'distribution_manager' => $this->distribution_manager,
            'approved_at'          => $this->approved_at?->toDateString(),
            'notes'                => $this->notes,
            'created_at'           => $this->created_at?->toIso8601String(),
            'updated_at'           => $this->updated_at?->toIso8601String(),

            'subgroups'            => StudentSubgroupResource::collection(
                $this->whenLoaded('subgroups')
            ),
            'academic_year'        => $this->whenLoaded('academicYear', fn () =>
                new AcademicYearResource($this->academicYear)
            ),
        ];
    }
}

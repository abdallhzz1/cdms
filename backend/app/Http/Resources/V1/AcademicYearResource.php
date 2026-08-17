<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin \App\Models\AcademicYear
 */
class AcademicYearResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'               => $this->id,
            'code'             => $this->code,
            'start_date'       => $this->start_date?->toDateString(),
            'end_date'         => $this->end_date?->toDateString(),
            'semester1_start'  => $this->semester1_start?->toDateString(),
            'semester1_end'    => $this->semester1_end?->toDateString(),
            'semester2_start'  => $this->semester2_start?->toDateString(),
            'semester2_end'    => $this->semester2_end?->toDateString(),
            'summer_start'     => $this->summer_start?->toDateString(),
            'summer_end'       => $this->summer_end?->toDateString(),
            'is_current'       => $this->is_current,
            'status'           => $this->status,
            'notes'            => $this->notes,
            'created_at'       => $this->created_at?->toIso8601String(),
            'updated_at'       => $this->updated_at?->toIso8601String(),
        ];
    }
}

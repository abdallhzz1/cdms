<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin \App\Models\Department
 */
class DepartmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                      => $this->id,
            'code'                    => $this->code,
            'name_ar'                 => $this->name_ar,
            'name_en'                 => $this->name_en,
            'dept_type'               => $this->dept_type,
            'serves_academic_levels'  => $this->serves_academic_levels,
            'is_active'               => $this->is_active,
            'notes'                   => $this->notes,
            'created_at'              => $this->created_at?->toIso8601String(),
            'updated_at'              => $this->updated_at?->toIso8601String(),
        ];
    }
}

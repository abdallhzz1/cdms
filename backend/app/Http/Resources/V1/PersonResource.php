<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin \App\Models\Person
 */
class PersonResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                       => $this->id,
            'staff_code'               => $this->staff_code,
            'full_name_ar'             => $this->full_name_ar,
            'full_name_en'             => $this->full_name_en,
            'email'                    => $this->email,
            'phone'                    => $this->phone,
            'department_id'            => $this->department_id,
            'primary_site_id'          => $this->primary_site_id,
            'specialty'                => $this->specialty,
            'academic_degree'          => $this->academic_degree,
            'license_number'           => $this->license_number,
            'contract_type'            => $this->contract_type,
            'contract_start'           => $this->contract_start?->toDateString(),
            'contract_end'             => $this->contract_end?->toDateString(),
            'teaching_hours_per_week'  => $this->teaching_hours_per_week,
            'available_days'           => $this->available_days,
            'max_students'             => $this->max_students,
            'photo_url'                => $this->photo_url,
            'cv_url'                   => $this->cv_url,
            'is_active'                => $this->is_active,
            'user_id'                  => $this->user_id,
            'notes'                    => $this->notes,
            'created_at'               => $this->created_at?->toIso8601String(),
            'updated_at'               => $this->updated_at?->toIso8601String(),

            // Eager-loaded relationships (only when loaded)
            'department'               => $this->whenLoaded('department', fn () =>
                new DepartmentResource($this->department)
            ),
            'primary_site'             => $this->whenLoaded('primarySite', fn () =>
                new TrainingSiteResource($this->primarySite)
            ),
            'activity_records'         => $this->whenLoaded('activityRecords'),
            'availabilities'           => $this->whenLoaded('availabilities'),
        ];
    }
}

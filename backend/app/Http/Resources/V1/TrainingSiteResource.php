<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\TrainingSite */
class TrainingSiteResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                          => $this->id,
            'site_code'                   => $this->site_code,
            'name_ar'                     => $this->name_ar,
            'name_en'                     => $this->name_en,
            'site_type'                   => $this->site_type,
            'city'                        => $this->city,
            'address'                     => $this->address,
            'latitude'                    => $this->latitude,
            'longitude'                   => $this->longitude,
            'distance_km'                 => $this->distance_km,
            'coordinator_name'            => $this->coordinator_name,
            'coordinator_phone'           => $this->coordinator_phone,
            'coordinator_email'           => $this->coordinator_email,
            'agreement_status'            => $this->agreement_status,
            'agreement_start'             => $this->agreement_start?->toDateString(),
            'agreement_end'               => $this->agreement_end?->toDateString(),
            'has_university_transport'    => $this->has_university_transport,
            'department_id'               => $this->department_id,
            'bed_count'                   => $this->bed_count,
            'max_students_per_period'     => $this->max_students_per_period,
            'max_students_per_doctor'     => $this->max_students_per_doctor,
            'training_days'               => $this->training_days,
            'accepts_night_shifts'        => $this->accepts_night_shifts,
            'female_student_restrictions' => $this->female_student_restrictions,
            'is_active'                   => $this->is_active,
            'notes'                       => $this->notes,
            'created_at'                  => $this->created_at?->toIso8601String(),
            'updated_at'                  => $this->updated_at?->toIso8601String(),

            'department'                  => $this->whenLoaded('department', fn () =>
                new DepartmentResource($this->department)
            ),
        ];
    }
}

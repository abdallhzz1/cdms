<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin \App\Models\Student
 */
class StudentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                      => $this->id,
            'university_number'       => $this->university_number,
            'full_name_ar'            => $this->full_name_ar,
            'full_name_en'            => $this->full_name_en,
            'national_id'             => $this->national_id,
            'gender'                  => $this->gender,
            'date_of_birth'           => $this->date_of_birth?->toDateString(),
            'city'                    => $this->city,
            'phone'                   => $this->phone,
            'guardian_phone'          => $this->guardian_phone,
            'university_email'        => $this->university_email,
            'photo_url'               => $this->photo_url,
            'batch_year'              => $this->batch_year,
            'academic_level'          => $this->academic_level,
            'academic_year_id'        => $this->academic_year_id,
            'study_plan_code'         => $this->study_plan_code,
            'registration_status'     => $this->registration_status,
            'academic_registration_status' => $this->academic_registration_status,
            'gpa'                     => $this->gpa,
            'credit_hours_passed'     => $this->credit_hours_passed,
            'warning_count'           => $this->warning_count,
            'last_warning_date'       => $this->last_warning_date?->toDateString(),
            'academic_advisor_id'     => $this->academic_advisor_id,
            'clinical_fees_status'    => $this->clinical_fees_status,
            'has_amboss_subscription' => $this->has_amboss_subscription,
            'notes'                   => $this->notes,
            'created_at'              => $this->created_at?->toIso8601String(),
            'updated_at'              => $this->updated_at?->toIso8601String(),

            // Eager-loaded relationships (only when loaded)
            'academic_year'           => $this->whenLoaded('academicYear', fn () =>
                new AcademicYearResource($this->academicYear)
            ),
            'academic_advisor'        => $this->whenLoaded('academicAdvisor', function () {
                if ($this->academic_advisor_id) {
                    $u = \App\Models\User::find($this->academic_advisor_id);
                    if ($u) {
                        return [
                            'id'           => $u->id,
                            'name'         => $u->name,
                            'full_name_ar' => $u->name,
                            'full_name_en' => $u->name,
                            'email'        => $u->email,
                        ];
                    }
                    if ($this->academicAdvisor) {
                        return [
                            'id'           => $this->academicAdvisor->id,
                            'name'         => $this->academicAdvisor->full_name_ar,
                            'full_name_ar' => $this->academicAdvisor->full_name_ar,
                            'full_name_en' => $this->academicAdvisor->full_name_en ?? $this->academicAdvisor->full_name_ar,
                            'email'        => $this->academicAdvisor->email,
                        ];
                    }
                }
                return null;
            }),
            'current_group_name'      => $this->whenLoaded('currentGroupAssignments', fn () =>
                $this->currentGroupAssignments->first()?->group?->name
            ),
            'registration_main_group' => $this->whenLoaded('groupRegistrationRosters', fn () =>
                $this->groupRegistrationRosters->first()?->group?->name
            ),
        ];
    }
}

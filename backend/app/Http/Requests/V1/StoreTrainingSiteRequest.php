<?php

namespace App\Http\Requests\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreTrainingSiteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'site_code'                   => ['required', 'string', 'max:20', 'unique:training_sites,site_code'],
            'name_ar'                     => ['required', 'string', 'max:255'],
            'name_en'                     => ['nullable', 'string', 'max:255'],
            'site_type'                   => ['required', 'in:hospital_public,hospital_private,medical_center,clinic,lab,online,other'],
            'city'                        => ['nullable', 'string', 'max:100'],
            'address'                     => ['nullable', 'string', 'max:500'],
            'latitude'                    => ['nullable', 'numeric', 'between:-90,90'],
            'longitude'                   => ['nullable', 'numeric', 'between:-180,180'],
            'distance_km'                 => ['nullable', 'numeric', 'min:0', 'max:500'],
            'coordinator_name'            => ['nullable', 'string', 'max:255'],
            'coordinator_phone'           => ['nullable', 'string', 'max:30'],
            'coordinator_email'           => ['nullable', 'email', 'max:255'],
            'agreement_status'            => ['nullable', 'in:active,expired,pending,none'],
            'agreement_start'             => ['nullable', 'date'],
            'agreement_end'               => ['nullable', 'date', 'after_or_equal:agreement_start'],
            'has_university_transport'    => ['boolean'],
            'department_id'               => ['nullable', 'exists:departments,id'],
            'bed_count'                   => ['nullable', 'integer', 'min:0'],
            'max_students_per_period'     => ['nullable', 'integer', 'min:0'],
            'max_students_per_doctor'     => ['nullable', 'integer', 'min:0', 'max:30'],
            'training_days'               => ['nullable', 'string', 'max:100'],
            'accepts_night_shifts'        => ['boolean'],
            'female_student_restrictions' => ['nullable', 'string', 'max:255'],
            'is_active'                   => ['boolean'],
            'notes'                       => ['nullable', 'string', 'max:2000'],
        ];
    }
}

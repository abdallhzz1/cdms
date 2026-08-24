<?php

namespace App\Http\Requests\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateStudentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $id = $this->route('student')?->id ?? $this->route('student');

        return [
            'university_number'       => ['sometimes', 'string', 'max:20', Rule::unique('students', 'university_number')->ignore($id)],
            'full_name_ar'            => ['sometimes', 'string', 'max:255'],
            'full_name_en'            => ['nullable', 'string', 'max:255'],
            'national_id'             => ['nullable', 'string', 'max:20'],
            'gender'                  => ['nullable', 'in:male,female'],
            'date_of_birth'           => ['nullable', 'date', 'before:today'],
            'city'                    => ['nullable', 'string', 'max:100'],
            'phone'                   => ['nullable', 'string', 'max:30'],
            'guardian_phone'          => ['nullable', 'string', 'max:30'],
            'university_email'        => ['nullable', 'email', 'max:255', Rule::unique('students', 'university_email')->ignore($id)],
            'photo_url'               => ['nullable', 'string'],
            'batch_year'              => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'academic_level'          => ['sometimes', 'in:fourth,fifth,sixth'],
            'academic_year_id'        => ['nullable', 'exists:academic_years,id'],
            'study_plan_code'         => ['nullable', 'string', 'max:50'],
            'registration_status'     => ['sometimes', 'in:active,suspended,on_leave,transferred,graduated,repeating,deferred'],
            'academic_registration_status' => ['sometimes', 'in:registered,unregistered'],
            'gpa'                     => ['nullable', 'numeric', 'min:0', 'max:100'],
            'credit_hours_passed'     => ['nullable', 'integer', 'min:0', 'max:500'],
            'warning_count'           => ['integer', 'min:0', 'max:10'],
            'last_warning_date'       => ['nullable', 'date'],
            'academic_advisor_id'     => ['nullable'],
            'clinical_fees_status'    => ['in:paid,pending,exempt,unknown'],
            'has_amboss_subscription' => ['boolean'],
            'notes'                   => ['nullable', 'string', 'max:2000'],
            'data_source'             => ['nullable', 'string', 'max:255'],
            'group_registration_cycle_id' => ['nullable', 'integer', 'exists:group_registration_cycles,id'],
            'main_group_code'         => ['nullable', 'required_with:group_registration_cycle_id', 'string', 'max:2'],
        ];
    }
}

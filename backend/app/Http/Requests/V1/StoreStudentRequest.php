<?php

namespace App\Http\Requests\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreStudentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'university_number'       => ['required', 'string', 'max:20', 'unique:students,university_number'],
            'full_name_ar'            => ['required', 'string', 'max:255'],
            'full_name_en'            => ['nullable', 'string', 'max:255'],
            'national_id'             => ['nullable', 'string', 'max:20'],
            'gender'                  => ['nullable', 'in:male,female'],
            'date_of_birth'           => ['nullable', 'date', 'before:today'],
            'city'                    => ['nullable', 'string', 'max:100'],
            'phone'                   => ['nullable', 'string', 'max:30'],
            'guardian_phone'          => ['nullable', 'string', 'max:30'],
            'university_email'        => ['nullable', 'email', 'max:255', 'unique:students,university_email'],
            'photo_url'               => ['nullable', 'string', 'max:500'],
            'batch_year'              => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'academic_level'          => ['required', 'in:fourth,fifth,sixth'],
            'academic_year_id'        => ['nullable', 'exists:academic_years,id'],
            'study_plan_code'         => ['nullable', 'string', 'max:50'],
            'registration_status'     => ['required', 'in:active,suspended,on_leave,transferred,graduated,repeating,deferred'],
            'gpa'                     => ['nullable', 'numeric', 'min:0', 'max:4'],
            'credit_hours_passed'     => ['nullable', 'integer', 'min:0', 'max:500'],
            'warning_count'           => ['integer', 'min:0', 'max:10'],
            'last_warning_date'       => ['nullable', 'date'],
            'academic_advisor_id'     => ['nullable', 'exists:people,id'],
            'clinical_fees_status'    => ['in:paid,pending,exempt,unknown'],
            'has_amboss_subscription' => ['boolean'],
            'notes'                   => ['nullable', 'string', 'max:2000'],
            'data_source'             => ['nullable', 'string', 'max:255'],
        ];
    }
}

<?php

namespace App\Http\Requests\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePersonRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'staff_code'               => ['nullable', 'string', 'max:20', 'unique:people,staff_code'],
            'full_name_ar'             => ['required', 'string', 'max:255'],
            'full_name_en'             => ['nullable', 'string', 'max:255'],
            'email'                    => ['nullable', 'email', 'max:255'],
            'phone'                    => ['nullable', 'string', 'max:30'],
            'department_id'            => ['nullable', 'exists:departments,id'],
            'primary_site_id'          => ['nullable', 'exists:training_sites,id'],
            'specialty'                => ['nullable', 'string', 'max:255'],
            'academic_degree'          => ['nullable', 'string', 'max:255'],
            'license_number'           => ['nullable', 'string', 'max:50'],
            'contract_type'            => ['nullable', 'in:full_time,part_time,visiting,honorary'],
            'contract_start'           => ['nullable', 'date'],
            'contract_end'             => ['nullable', 'date', 'after_or_equal:contract_start'],
            'teaching_hours_per_week'  => ['nullable', 'integer', 'min:0', 'max:40'],
            'available_days'           => ['nullable', 'string', 'max:255'],
            'max_students'             => ['nullable', 'integer', 'min:1', 'max:50'],
            'photo_url'                => ['nullable', 'string'],
            'cv_url'                   => ['nullable', 'string', 'max:500'],
            'is_active'                => ['boolean'],
            'user_id'                  => ['nullable', 'exists:users,id', 'unique:people,user_id'],
            'password'                 => ['nullable', 'string', 'min:6'],
            'notes'                    => ['nullable', 'string', 'max:2000'],
        ];
    }
}

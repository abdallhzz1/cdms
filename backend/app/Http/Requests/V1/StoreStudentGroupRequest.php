<?php

namespace App\Http\Requests\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreStudentGroupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'academic_year_id'     => ['required', 'exists:academic_years,id'],
            'academic_level'       => ['required', 'in:fourth,fifth,sixth'],
            'name'                 => ['required', 'string', 'max:10'],
            'distribution_manager' => ['nullable', 'string', 'max:255'],
            'approved_at'          => ['nullable', 'date'],
            'notes'                => ['nullable', 'string', 'max:2000'],

            // Subgroups can optionally be created along with the group
            'subgroups'            => ['nullable', 'array'],
            'subgroups.*.name'     => ['required_with:subgroups', 'string', 'max:10'],
            'subgroups.*.min_size' => ['nullable', 'integer', 'min:1', 'max:30'],
            'subgroups.*.max_size' => ['nullable', 'integer', 'min:1', 'max:30'],
        ];
    }
}

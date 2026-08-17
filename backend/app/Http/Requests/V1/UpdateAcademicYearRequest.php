<?php

namespace App\Http\Requests\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAcademicYearRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $id = $this->route('academic_year')?->id ?? $this->route('academic_year');

        return [
            'code'            => ['sometimes', 'string', 'max:20', Rule::unique('academic_years', 'code')->ignore($id), 'regex:/^\d{4}\/\d{4}$/'],
            'start_date'      => ['sometimes', 'date'],
            'end_date'        => ['sometimes', 'date', 'after:start_date'],
            'semester1_start' => ['nullable', 'date'],
            'semester1_end'   => ['nullable', 'date'],
            'semester2_start' => ['nullable', 'date'],
            'semester2_end'   => ['nullable', 'date'],
            'summer_start'    => ['nullable', 'date'],
            'summer_end'      => ['nullable', 'date'],
            'is_current'      => ['boolean'],
            'status'          => ['sometimes', 'in:planned,active,closed'],
            'notes'           => ['nullable', 'string', 'max:2000'],
        ];
    }
}

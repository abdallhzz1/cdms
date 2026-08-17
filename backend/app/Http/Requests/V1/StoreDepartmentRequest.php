<?php

namespace App\Http\Requests\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreDepartmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'code'                    => ['required', 'string', 'max:20', 'unique:departments,code', 'regex:/^DEP-[A-Z]{2,5}$/'],
            'name_ar'                 => ['required', 'string', 'max:255'],
            'name_en'                 => ['required', 'string', 'max:255'],
            'dept_type'               => ['required', 'in:primary,sub'],
            'serves_academic_levels'  => ['nullable', 'array'],
            'serves_academic_levels.*' => ['in:fourth,fifth,sixth'],
            'is_active'               => ['boolean'],
            'notes'                   => ['nullable', 'string', 'max:2000'],
        ];
    }
}

<?php

namespace App\Http\Requests\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateDepartmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $id = $this->route('department')?->id ?? $this->route('department');

        return [
            'code'                    => ['sometimes', 'string', 'max:20', Rule::unique('departments', 'code')->ignore($id)],
            'name_ar'                 => ['sometimes', 'string', 'max:255'],
            'name_en'                 => ['sometimes', 'string', 'max:255'],
            'dept_type'               => ['sometimes', 'in:primary,sub'],
            'serves_academic_levels'  => ['nullable', 'array'],
            'serves_academic_levels.*' => ['in:fourth,fifth,sixth'],
            'is_active'               => ['boolean'],
            'notes'                   => ['nullable', 'string', 'max:2000'],
        ];
    }
}

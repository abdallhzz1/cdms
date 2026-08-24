<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateRotationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $rotationId = $this->route('rotation')->id ?? $this->route('rotation');

        return [
            'academic_year_id' => 'sometimes|exists:academic_years,id',
            'code'             => [
                'sometimes',
                'string',
                'max:50',
                Rule::unique('rotations')->where(function ($query) {
                    return $query->where('academic_year_id', $this->input('academic_year_id', $this->route('rotation')->academic_year_id ?? null));
                })->ignore($rotationId)
            ],
            'name'             => 'sometimes|string|max:255',
            'academic_level'   => 'sometimes|in:fourth,fifth,sixth',
            'duration_weeks'   => 'nullable|integer|min:1',
            'start_date'       => 'nullable|date',
            'end_date'         => 'nullable|date|after_or_equal:start_date',
            'status'           => 'nullable|in:draft,active,archived',
            'departments'      => 'nullable|array',
            'departments.*'    => 'exists:departments,id',
            'blocks'           => 'nullable|array',
            'blocks.*.block_code' => 'required_with:blocks|string|max:50',
            'blocks.*.from_week'  => 'required_with:blocks|integer|min:1',
            'blocks.*.to_week'    => 'required_with:blocks|integer|gte:blocks.*.from_week',
            'blocks.*.department_id' => 'nullable|exists:departments,id',
            'site_capacity_rules' => 'nullable|array',
            'site_capacity_rules.*.site_id' => 'required_with:site_capacity_rules|integer|distinct|exists:training_sites,id',
            'site_capacity_rules.*.max_students' => 'required_with:site_capacity_rules|integer|min:1|max:500',
            'site_capacity_rules.*.notes' => 'nullable|string|max:1000',
        ];
    }
}

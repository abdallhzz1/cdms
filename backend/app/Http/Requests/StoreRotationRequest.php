<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreRotationRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true; // handled by middleware
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'academic_year_id' => 'required|exists:academic_years,id',
            'code'             => 'required|string|max:50',
            'name'             => 'required|string|max:255',
            'academic_level'   => 'required|in:fourth,fifth,sixth',
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
        ];
    }
}

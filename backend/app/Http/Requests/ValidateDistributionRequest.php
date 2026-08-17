<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ValidateDistributionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // handled by route middleware
    }

    public function rules(): array
    {
        return [
            'assignments' => 'required|array',
            'assignments.*.subgroup_id' => 'required|integer|exists:student_subgroups,id',
            'assignments.*.rotation_block_id' => 'required|integer|exists:rotation_blocks,id',
            'assignments.*.site_id' => 'required|integer|exists:training_sites,id',
            'assignments.*.supervisor_id' => 'nullable|integer|exists:people,id',
        ];
    }
}

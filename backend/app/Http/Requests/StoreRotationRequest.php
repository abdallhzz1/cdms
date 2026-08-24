<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

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
            'code'             => [
                'required',
                'string',
                'max:50',
                Rule::unique('rotations')->where(
                    fn ($query) => $query->where('academic_year_id', $this->input('academic_year_id'))
                ),
            ],
            'name'             => 'required|string|max:255',
            'academic_level'   => 'required|in:fourth,fifth,sixth',
            'duration_weeks'   => 'nullable|integer|min:1',
            'start_date'       => 'nullable|date',
            'end_date'         => 'nullable|date|after_or_equal:start_date',
            'status'           => 'nullable|in:draft,active,archived',
            'departments'      => 'nullable|array',
            'departments.*'    => 'exists:departments,id',
            'blocks'           => 'required_if:status,active|array|min:1',
            'blocks.*.block_code' => 'required_with:blocks|string|max:50|distinct',
            'blocks.*.from_week'  => 'required_with:blocks|integer|min:1',
            'blocks.*.to_week'    => 'required_with:blocks|integer|gte:blocks.*.from_week',
            'blocks.*.department_id' => 'nullable|exists:departments,id',
            'site_capacity_rules' => 'required_if:status,active|array|min:1',
            'site_capacity_rules.*.site_id' => 'required_with:site_capacity_rules|integer|distinct|exists:training_sites,id',
            'site_capacity_rules.*.max_students' => 'required_with:site_capacity_rules|integer|min:1|max:500',
            'site_capacity_rules.*.notes' => 'nullable|string|max:1000',
        ];
    }

    public function after(): array
    {
        return [function ($validator): void {
            $blocks = collect($this->input('blocks', []))
                ->filter(fn ($block) => is_array($block) && isset($block['from_week'], $block['to_week']))
                ->sortBy('from_week')
                ->values();

            for ($index = 1; $index < $blocks->count(); $index++) {
                if ((int) $blocks[$index]['from_week'] <= (int) $blocks[$index - 1]['to_week']) {
                    $validator->errors()->add('blocks', 'Clinical rotation blocks must not overlap.');
                    break;
                }
            }

            $duration = $this->integer('duration_weeks');
            if ($duration > 0 && $blocks->contains(fn ($block) => (int) $block['to_week'] > $duration)) {
                $validator->errors()->add('duration_weeks', 'Rotation duration must cover all clinical blocks.');
            }
        }];
    }
}

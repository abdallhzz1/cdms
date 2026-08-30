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
            'end_date'        => ['sometimes', 'date'],
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

    public function after(): array
    {
        return [function ($validator): void {
            $year = $this->route('academic_year');
            $start = $this->input('start_date', $year->start_date?->toDateString());
            $end = $this->input('end_date', $year->end_date?->toDateString());
            if ($start && $end && $end <= $start) {
                $validator->errors()->add('end_date', 'يجب أن تكون نهاية العام بعد بدايته.');
            }

            $dates = [];
            foreach (['semester1_start', 'semester1_end', 'semester2_start', 'semester2_end', 'summer_start', 'summer_end'] as $field) {
                $dates[$field] = $this->exists($field) ? $this->input($field) : $year->{$field}?->toDateString();
                if ($dates[$field] && $start && $end && ($dates[$field] < $start || $dates[$field] > $end)) {
                    $validator->errors()->add($field, 'يجب أن يقع هذا التاريخ ضمن بداية ونهاية العام الأكاديمي.');
                }
            }
            foreach ([['semester1_start', 'semester1_end'], ['semester2_start', 'semester2_end'], ['summer_start', 'summer_end']] as [$from, $to]) {
                if ($dates[$from] && $dates[$to] && $dates[$to] < $dates[$from]) {
                    $validator->errors()->add($to, 'يجب أن تكون نهاية الفترة بعد بدايتها.');
                }
            }
        }];
    }
}

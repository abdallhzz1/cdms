<?php

namespace App\Http\Requests\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreAcademicYearRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Authorization enforced by route middleware (permission:academic_years.manage)
        return true;
    }

    public function rules(): array
    {
        return [
            'code'            => ['required', 'string', 'max:20', 'unique:academic_years,code', 'regex:/^\d{4}\/\d{4}$/'],
            'start_date'      => ['required', 'date'],
            'end_date'        => ['required', 'date', 'after:start_date'],
            'semester1_start' => ['nullable', 'date', 'after_or_equal:start_date'],
            'semester1_end'   => ['nullable', 'date', 'after:semester1_start'],
            'semester2_start' => ['nullable', 'date', 'after:semester1_end'],
            'semester2_end'   => ['nullable', 'date', 'after:semester2_start'],
            'summer_start'    => ['nullable', 'date'],
            'summer_end'      => ['nullable', 'date', 'after:summer_start'],
            'is_current'      => ['boolean'],
            'status'          => ['required', 'in:planned,active,closed'],
            'notes'           => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function messages(): array
    {
        return [
            'code.regex' => 'يجب كتابة العام الأكاديمي بصيغة 2026/2027.',
            'end_date.after' => 'يجب أن تكون نهاية العام بعد بدايته.',
        ];
    }

    public function after(): array
    {
        return [function ($validator): void {
            $start = $this->input('start_date');
            $end = $this->input('end_date');
            foreach (['semester1_start', 'semester1_end', 'semester2_start', 'semester2_end', 'summer_start', 'summer_end'] as $field) {
                $value = $this->input($field);
                if ($value && $start && $end && ($value < $start || $value > $end)) {
                    $validator->errors()->add($field, 'يجب أن يقع هذا التاريخ ضمن بداية ونهاية العام الأكاديمي.');
                }
            }
        }];
    }
}

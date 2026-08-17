<?php

namespace App\Http\Requests\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreCourseRequest extends FormRequest
{
    public function authorize(): bool { return true; }
    public function rules(): array { return ['code' => ['required','string','max:30','unique:courses,code'], 'name_ar' => ['required','string','max:255'], 'name_en' => ['nullable','string','max:255'], 'credit_hours' => ['required','integer','min:1','max:30'], 'academic_level' => ['nullable','in:fourth,fifth,sixth'], 'is_active' => ['boolean'], 'description' => ['nullable','string','max:2000']]; }
}

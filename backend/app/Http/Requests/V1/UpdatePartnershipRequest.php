<?php

namespace App\Http\Requests\V1;

use Illuminate\Foundation\Http\FormRequest;

class UpdatePartnershipRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'institution_name' => ['sometimes', 'string', 'max:255'],
            'purpose'          => ['nullable', 'string', 'max:500'],
            'scope'            => ['sometimes', 'in:local,international'],
            'start_date'       => ['nullable', 'date'],
            'end_date'         => ['nullable', 'date'],
            'is_active'        => ['boolean'],
            'notes'            => ['nullable', 'string', 'max:2000'],
            'data_source'      => ['nullable', 'string', 'max:255'],
        ];
    }
}

<?php

return [
    'required' => 'The :attribute field is required.',
    'required_without' => 'The :attribute field is required when :values is not present.',
    'string' => 'The :attribute must be text.',
    'integer' => 'The :attribute must be an integer.',
    'numeric' => 'The :attribute must be a number.',
    'boolean' => 'The :attribute field must be true or false.',
    'array' => 'The :attribute must be a list.',
    'date' => 'The :attribute must be a valid date.',
    'date_format' => 'The :attribute must match the format :format.',
    'email' => 'The :attribute must be a valid email address.',
    'exists' => 'The selected :attribute is invalid.',
    'unique' => 'The :attribute has already been used.',
    'in' => 'The selected :attribute is invalid.',
    'min' => ['numeric' => 'The :attribute must be at least :min.', 'string' => 'The :attribute must contain at least :min characters.', 'array' => 'The :attribute must contain at least :min items.'],
    'max' => ['numeric' => 'The :attribute may not be greater than :max.', 'string' => 'The :attribute may not contain more than :max characters.', 'file' => 'The :attribute may not be larger than :max kilobytes.', 'array' => 'The :attribute may not contain more than :max items.'],
    'after_or_equal' => 'The :attribute must be a date after or equal to :date.',
    'gt' => ['numeric' => 'The :attribute must be greater than :value.'],
    'mimes' => 'The :attribute must be a file of type: :values.',
    'file' => 'The :attribute must be a file.',
];

<?php

return [
    'required' => 'حقل :attribute مطلوب.',
    'required_without' => 'حقل :attribute مطلوب عند عدم وجود :values.',
    'string' => 'يجب أن يكون حقل :attribute نصاً.',
    'integer' => 'يجب أن يكون حقل :attribute عدداً صحيحاً.',
    'numeric' => 'يجب أن يكون حقل :attribute رقماً.',
    'boolean' => 'يجب أن تكون قيمة :attribute صحيحة أو خاطئة.',
    'array' => 'يجب أن يكون حقل :attribute قائمة.',
    'date' => 'يجب أن يكون حقل :attribute تاريخاً صحيحاً.',
    'date_format' => 'يجب أن يطابق حقل :attribute الصيغة :format.',
    'email' => 'يجب أن يكون حقل :attribute بريداً إلكترونياً صحيحاً.',
    'exists' => 'القيمة المحددة في حقل :attribute غير صحيحة.',
    'unique' => 'قيمة حقل :attribute مستخدمة مسبقاً.',
    'in' => 'القيمة المحددة في حقل :attribute غير صحيحة.',
    'min' => ['numeric' => 'يجب ألا تقل قيمة :attribute عن :min.', 'string' => 'يجب ألا يقل حقل :attribute عن :min أحرف.', 'array' => 'يجب ألا يحتوي حقل :attribute على أقل من :min عناصر.'],
    'max' => ['numeric' => 'يجب ألا تزيد قيمة :attribute عن :max.', 'string' => 'يجب ألا يزيد حقل :attribute عن :max أحرف.', 'file' => 'يجب ألا يزيد حجم :attribute عن :max كيلوبايت.', 'array' => 'يجب ألا يحتوي حقل :attribute على أكثر من :max عناصر.'],
    'after_or_equal' => 'يجب أن يكون تاريخ :attribute مساوياً أو بعد :date.',
    'gt' => ['numeric' => 'يجب أن تكون قيمة :attribute أكبر من :value.'],
    'mimes' => 'يجب أن يكون :attribute ملفاً من نوع: :values.',
    'file' => 'يجب أن يكون حقل :attribute ملفاً.',
];

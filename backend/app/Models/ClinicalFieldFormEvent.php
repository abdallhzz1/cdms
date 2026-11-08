<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClinicalFieldFormEvent extends Model
{
    protected $fillable = [
        'clinical_field_form_id', 'user_id', 'action', 'from_status',
        'to_status', 'note', 'metadata',
    ];

    protected function casts(): array
    {
        return ['metadata' => 'array'];
    }

    public function form(): BelongsTo
    {
        return $this->belongsTo(ClinicalFieldForm::class, 'clinical_field_form_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

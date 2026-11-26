<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClinicalFeedbackWindow extends Model
{
    protected $guarded = [];

    protected $casts = ['is_enabled' => 'boolean'];

    public function rotation()
    {
        return $this->belongsTo(Rotation::class);
    }
}

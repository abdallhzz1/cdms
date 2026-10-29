<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClinicalPeriodLevelDate extends Model
{
    public const LEVELS = ['fourth', 'fifth', 'sixth'];

    protected $fillable = [
        'clinical_period_id',
        'academic_level',
        'start_date',
        'end_date',
        'weeks_count',
    ];

    protected $casts = [
        'clinical_period_id' => 'integer',
        'start_date' => 'date',
        'end_date' => 'date',
        'weeks_count' => 'integer',
    ];

    public function clinicalPeriod(): BelongsTo
    {
        return $this->belongsTo(ClinicalPeriod::class);
    }
}

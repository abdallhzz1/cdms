<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DistributionVersionBreak extends Model
{
    protected $fillable = ['distribution_version_id', 'label', 'start_date', 'end_date'];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
    ];

    public function distributionVersion(): BelongsTo
    {
        return $this->belongsTo(DistributionVersion::class);
    }
}

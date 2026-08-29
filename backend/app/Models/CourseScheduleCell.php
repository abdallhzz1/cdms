<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CourseScheduleCell extends Model
{
    protected $guarded = [];

    public function distributionVersion(): BelongsTo
    {
        return $this->belongsTo(DistributionVersion::class);
    }

    public function courseScheduleRow(): BelongsTo
    {
        return $this->belongsTo(CourseScheduleRow::class);
    }

    public function rotationBlock(): BelongsTo
    {
        return $this->belongsTo(RotationBlock::class);
    }

    public function studentSubgroup(): BelongsTo
    {
        return $this->belongsTo(StudentSubgroup::class);
    }
}

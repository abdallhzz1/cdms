<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CourseScheduleBlockActivity extends Model
{
    protected $fillable = [
        'distribution_version_id',
        'rotation_block_id',
        'activity_type',
        'activity_label',
        'activity_scope',
        'main_group_codes',
    ];

    protected $casts = [
        'main_group_codes' => 'array',
    ];

    public function distributionVersion()
    {
        return $this->belongsTo(DistributionVersion::class);
    }

    public function rotationBlock()
    {
        return $this->belongsTo(RotationBlock::class);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DistributionVersion extends Model
{
    use HasFactory;

    protected $fillable = [
        'rotation_id',
        'source_version_id',
        'name',
        'status',
        'is_current',
    ];

    protected $casts = [
        'is_current' => 'boolean',
    ];

    public function rotation()
    {
        return $this->belongsTo(Rotation::class);
    }

    public function sourceVersion()
    {
        return $this->belongsTo(self::class, 'source_version_id');
    }

    public function revisions()
    {
        return $this->hasMany(self::class, 'source_version_id');
    }

    public function assignments()
    {
        return $this->hasMany(StudentClinicalAssignment::class);
    }

    public function courseScheduleRows()
    {
        return $this->hasMany(CourseScheduleRow::class);
    }

    public function courseScheduleCells()
    {
        return $this->hasMany(CourseScheduleCell::class);
    }

    public function scopeCurrentPublishedForRotation($query, int $rotationId)
    {
        return $query->where('rotation_id', $rotationId)
            ->where('status', 'published')
            ->where('is_current', true);
    }
}

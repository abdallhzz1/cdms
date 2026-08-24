<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Rotation extends Model
{
    use HasFactory;

    protected $fillable = [
        'academic_year_id',
        'course_id',
        'code',
        'name',
        'academic_level',
        'duration_weeks',
        'start_date',
        'end_date',
        'status',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'duration_weeks' => 'integer',
    ];

    public function academicYear()
    {
        return $this->belongsTo(AcademicYear::class);
    }

    public function course()
    {
        return $this->belongsTo(Course::class);
    }

    public function blocks()
    {
        return $this->hasMany(RotationBlock::class);
    }

    public function distributionVersions()
    {
        return $this->hasMany(DistributionVersion::class);
    }

    public function departments()
    {
        return $this->belongsToMany(Department::class);
    }

    public function siteCapacityRules()
    {
        return $this->hasMany(SiteCapacityRule::class);
    }
}

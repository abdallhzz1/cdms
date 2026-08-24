<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentClinicalAssignment extends Model
{
    use HasFactory;

    protected $guarded = [];

    public function distributionVersion(): BelongsTo
    {
        return $this->belongsTo(DistributionVersion::class);
    }

    public function courseScheduleRow(): BelongsTo
    {
        return $this->belongsTo(CourseScheduleRow::class);
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function studentSubgroup(): BelongsTo
    {
        return $this->belongsTo(StudentSubgroup::class);
    }

    public function rotationBlock(): BelongsTo
    {
        return $this->belongsTo(RotationBlock::class);
    }

    public function trainingSite(): BelongsTo
    {
        return $this->belongsTo(TrainingSite::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function supervisor(): BelongsTo
    {
        return $this->belongsTo(Person::class, 'supervisor_id');
    }
}

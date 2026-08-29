<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CourseScheduleRow extends Model
{
    protected $fillable = [
        'distribution_version_id',
        'row_type',
        'person_id',
        'training_site_id',
        'label',
        'sort_order',
    ];

    protected $casts = [
        'distribution_version_id' => 'integer',
        'person_id' => 'integer',
        'training_site_id' => 'integer',
        'sort_order' => 'integer',
    ];

    public function version()
    {
        return $this->belongsTo(DistributionVersion::class, 'distribution_version_id');
    }

    public function person()
    {
        return $this->belongsTo(Person::class);
    }

    public function trainingSite()
    {
        return $this->belongsTo(TrainingSite::class);
    }

    public function assignments()
    {
        return $this->hasMany(StudentClinicalAssignment::class);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClinicalMarkRelease extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected $casts = ['starts_on' => 'date', 'ends_on' => 'date', 'released_at' => 'datetime', 'score' => 'decimal:2', 'max_score' => 'decimal:2'];

    public function window()
    {
        return $this->belongsTo(ClinicalFeedbackWindow::class, 'window_id');
    }

    public function assessment()
    {
        return $this->belongsTo(ClinicalAssessment::class);
    }

    public function supervisor()
    {
        return $this->belongsTo(Person::class, 'supervisor_id');
    }
}

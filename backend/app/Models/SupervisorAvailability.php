<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupervisorAvailability extends Model
{
    protected $fillable = ['person_id', 'academic_year', 'available_from', 'available_until', 'day', 'from_time', 'until_time', 'department_id', 'training_site_id', 'status', 'reason', 'notes'];

    protected function casts(): array
    {
        return ['available_from' => 'date', 'available_until' => 'date'];
    }

    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }

    public function trainingSite(): BelongsTo
    {
        return $this->belongsTo(TrainingSite::class);
    }
}

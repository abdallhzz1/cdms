<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StudentEvent extends Model
{
    protected $fillable = ['public_id', 'type', 'title_ar', 'title_en', 'description_ar', 'description_en',
        'location_ar', 'location_en', 'starts_at', 'ends_at', 'check_in_opens_at', 'check_in_closes_at',
        'eligible_levels', 'status', 'check_in_enabled', 'check_in_opened_at', 'check_in_closed_at',
        'created_by', 'updated_by'];

    protected function casts(): array
    {
        return ['starts_at' => 'datetime', 'ends_at' => 'datetime', 'check_in_opens_at' => 'datetime',
            'check_in_closes_at' => 'datetime', 'check_in_enabled' => 'boolean',
            'check_in_opened_at' => 'datetime', 'check_in_closed_at' => 'datetime',
            'eligible_levels' => 'array'];
    }

    public function attendances(): HasMany
    {
        return $this->hasMany(StudentEventAttendance::class);
    }
}

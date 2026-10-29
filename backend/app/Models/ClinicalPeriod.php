<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ClinicalPeriod extends Model
{
    protected $fillable = [
        'academic_year_id', 'code', 'name_ar', 'name_en', 'sequence',
        'start_date', 'end_date', 'weeks_count', 'status', 'notes',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'sequence' => 'integer',
        'weeks_count' => 'integer',
    ];

    public function academicYear() { return $this->belongsTo(AcademicYear::class); }
    public function rotations() { return $this->hasMany(Rotation::class); }

    public function levelDates(): HasMany
    {
        return $this->hasMany(ClinicalPeriodLevelDate::class);
    }

    public function datesForLevel(string $level): ?ClinicalPeriodLevelDate
    {
        if ($this->relationLoaded('levelDates')) {
            return $this->levelDates->firstWhere('academic_level', $level);
        }

        return $this->levelDates()->where('academic_level', $level)->first();
    }
}

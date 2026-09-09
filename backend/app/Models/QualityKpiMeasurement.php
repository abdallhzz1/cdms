<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class QualityKpiMeasurement extends Model
{
    protected $fillable = [
        'quality_kpi_id', 'academic_year', 'measured_at', 'numeric_value',
        'display_value', 'achievement_status', 'review_status', 'evidence', 'notes', 'recorded_by',
        'reviewed_by', 'reviewed_at', 'review_notes',
    ];

    protected function casts(): array
    {
        return ['measured_at' => 'date', 'numeric_value' => 'decimal:2', 'reviewed_at' => 'datetime'];
    }

    public function kpi() { return $this->belongsTo(QualityKpi::class, 'quality_kpi_id'); }
    public function recorder() { return $this->belongsTo(User::class, 'recorded_by'); }
    public function reviewer() { return $this->belongsTo(User::class, 'reviewed_by'); }
}

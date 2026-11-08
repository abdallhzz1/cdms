<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ClinicalFieldForm extends Model
{
    protected $fillable = [
        'public_id', 'reference_number', 'type', 'status', 'revision', 'locale',
        'creator_user_id', 'recipient_user_id', 'department_id', 'training_site_id',
        'course_id', 'activity_date', 'period_from', 'period_to', 'payload',
        'is_urgent', 'latest_review_note', 'submitted_at', 'acknowledged_at', 'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'is_urgent' => 'boolean',
            'activity_date' => 'date',
            'period_from' => 'date',
            'period_to' => 'date',
            'submitted_at' => 'datetime',
            'acknowledged_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'creator_user_id');
    }

    public function recipient(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recipient_user_id');
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function trainingSite(): BelongsTo
    {
        return $this->belongsTo(TrainingSite::class);
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(ClinicalFieldFormEvent::class);
    }
}

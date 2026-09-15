<?php

namespace App\Models;

use Database\Factories\StudentPolicyCampaignFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class StudentPolicyCampaign extends Model
{
    /** @use HasFactory<StudentPolicyCampaignFactory> */
    use HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['target_levels' => 'array', 'deadline' => 'date', 'published_at' => 'datetime', 'closed_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::creating(fn (self $campaign) => $campaign->public_id ??= (string) Str::uuid());
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(StudentPolicyDocument::class, 'student_policy_document_id');
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(StudentPolicyAssignment::class, 'campaign_id');
    }
}

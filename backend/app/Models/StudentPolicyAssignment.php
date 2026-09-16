<?php

namespace App\Models;

use Database\Factories\StudentPolicyAssignmentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentPolicyAssignment extends Model
{
    /** @use HasFactory<StudentPolicyAssignmentFactory> */
    use HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'opened_at' => 'datetime', 'opened_ar_at' => 'datetime', 'opened_en_at' => 'datetime',
            'acknowledged_at' => 'datetime', 'paper_received_at' => 'datetime',
            'scan_uploaded_at' => 'datetime',
        ];
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(StudentPolicyCampaign::class, 'campaign_id');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }
}

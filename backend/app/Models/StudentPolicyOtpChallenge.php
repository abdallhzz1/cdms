<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentPolicyOtpChallenge extends Model
{
    protected $guarded = [];

    protected $hidden = ['otp_hash', 'access_token_hash'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'verified_at' => 'datetime', 'access_expires_at' => 'datetime'];
    }

    public function campaign(): BelongsTo { return $this->belongsTo(StudentPolicyCampaign::class, 'campaign_id'); }
    public function assignment(): BelongsTo { return $this->belongsTo(StudentPolicyAssignment::class, 'assignment_id'); }
}

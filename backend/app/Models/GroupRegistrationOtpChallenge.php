<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GroupRegistrationOtpChallenge extends Model
{
    protected $fillable = ['group_registration_cycle_id', 'student_id', 'challenge_token_hash', 'otp_hash', 'attempts', 'expires_at', 'verified_at', 'access_token_hash', 'access_expires_at', 'consumed_at', 'request_ip_hash'];
    protected $hidden = ['challenge_token_hash', 'otp_hash', 'access_token_hash', 'request_ip_hash'];
    protected function casts(): array { return ['expires_at'=>'datetime','verified_at'=>'datetime','access_expires_at'=>'datetime','consumed_at'=>'datetime']; }
    public function cycle(): BelongsTo { return $this->belongsTo(GroupRegistrationCycle::class, 'group_registration_cycle_id'); }
    public function student(): BelongsTo { return $this->belongsTo(Student::class); }
}

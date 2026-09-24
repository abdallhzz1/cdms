<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClinicalQrAttendanceRoster extends Model
{
    protected $fillable = ['clinical_qr_attendance_session_id', 'student_id', 'checked_in_at', 'checked_out_at', 'outcome', 'recording_source', 'is_incomplete', 'manual_reason', 'manual_actor_user_id'];
    protected function casts(): array { return ['checked_in_at' => 'datetime', 'checked_out_at' => 'datetime', 'is_incomplete' => 'boolean']; }
    public function session(): BelongsTo { return $this->belongsTo(ClinicalQrAttendanceSession::class, 'clinical_qr_attendance_session_id'); }
    public function student(): BelongsTo { return $this->belongsTo(Student::class); }
    public function manualActor(): BelongsTo { return $this->belongsTo(User::class, 'manual_actor_user_id'); }
}

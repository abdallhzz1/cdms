<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClinicalQrScanEvent extends Model
{
    public $timestamps = false;
    protected $fillable = ['clinical_qr_attendance_session_id', 'student_id', 'phase', 'result_code', 'qr_nonce_hash', 'ip_hash', 'user_agent', 'occurred_at'];
    protected function casts(): array { return ['occurred_at' => 'datetime']; }
    public function session(): BelongsTo { return $this->belongsTo(ClinicalQrAttendanceSession::class, 'clinical_qr_attendance_session_id'); }
    public function student(): BelongsTo { return $this->belongsTo(Student::class); }
}

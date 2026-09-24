<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ClinicalQrAttendanceSession extends Model
{
    public const STATES = ['check_in_open', 'check_in_closed', 'check_out_open', 'finalized'];

    protected $fillable = ['public_id', 'assignment_key', 'student_clinical_assignment_id', 'rotation_block_id', 'training_site_id', 'supervisor_id', 'clinical_session_id', 'session_date', 'state', 'active_guard', 'version', 'check_in_opened_at', 'check_in_closed_at', 'check_out_opened_at', 'check_out_closed_at', 'finalized_at', 'finalized_by_user_id'];

    protected function casts(): array
    {
        return ['session_date' => 'date', 'check_in_opened_at' => 'datetime', 'check_in_closed_at' => 'datetime', 'check_out_opened_at' => 'datetime', 'check_out_closed_at' => 'datetime', 'finalized_at' => 'datetime'];
    }

    public function roster(): HasMany { return $this->hasMany(ClinicalQrAttendanceRoster::class); }
    public function scanEvents(): HasMany { return $this->hasMany(ClinicalQrScanEvent::class); }
    public function assignment(): BelongsTo { return $this->belongsTo(StudentClinicalAssignment::class, 'student_clinical_assignment_id'); }
    public function trainingSite(): BelongsTo { return $this->belongsTo(TrainingSite::class); }
    public function supervisor(): BelongsTo { return $this->belongsTo(Person::class, 'supervisor_id'); }
    public function clinicalSession(): BelongsTo { return $this->belongsTo(ClinicalSession::class); }
}

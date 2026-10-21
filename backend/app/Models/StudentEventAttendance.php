<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentEventAttendance extends Model
{
    protected $fillable = ['student_event_id', 'student_id', 'checked_in_at', 'source', 'recorded_by',
        'reason', 'voided_at', 'voided_by', 'void_reason'];

    protected function casts(): array
    {
        return ['checked_in_at' => 'datetime', 'voided_at' => 'datetime'];
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }
}

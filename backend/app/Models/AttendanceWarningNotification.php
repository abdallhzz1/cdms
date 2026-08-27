<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendanceWarningNotification extends Model
{
    protected $fillable = [
        'student_id',
        'rotation_id',
        'academic_year_id',
        'course_id',
        'threshold_percent',
        'absent_days',
        'total_required_days',
        'absence_percentage',
        'recipient_email',
        'delivery_status',
        'failure_code',
        'sent_by_user_id',
        'sent_at',
    ];

    protected function casts(): array
    {
        return [
            'threshold_percent' => 'integer',
            'absent_days' => 'integer',
            'total_required_days' => 'integer',
            'absence_percentage' => 'decimal:2',
            'sent_at' => 'datetime',
        ];
    }

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function rotation()
    {
        return $this->belongsTo(Rotation::class);
    }

    public function sender()
    {
        return $this->belongsTo(User::class, 'sent_by_user_id');
    }
}

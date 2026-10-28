<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CourseScheduleRowSupervisor extends Model
{
    protected $fillable = ['course_schedule_row_id', 'person_id', 'weekdays'];

    protected $casts = [
        'course_schedule_row_id' => 'integer',
        'person_id' => 'integer',
        'weekdays' => 'array',
    ];

    public function row(): BelongsTo
    {
        return $this->belongsTo(CourseScheduleRow::class, 'course_schedule_row_id');
    }

    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }
}

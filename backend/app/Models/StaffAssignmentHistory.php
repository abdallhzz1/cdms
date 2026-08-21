<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StaffAssignmentHistory extends Model
{
    protected $fillable = [
        'person_id',
        'role_type',
        'department_id',
        'training_site_id',
        'start_date',
        'end_date',
        'reference',
        'status',
        'notes',
    ];

    /**
     * @return BelongsTo<Person, $this>
     */
    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }

    /**
     * @return BelongsTo<Department, $this>
     */
    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    /**
     * @return BelongsTo<TrainingSite, $this>
     */
    public function trainingSite(): BelongsTo
    {
        return $this->belongsTo(TrainingSite::class, 'training_site_id');
    }
}

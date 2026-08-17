<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupervisorAnnualWorkload extends Model
{
    protected $fillable = ['academic_year', 'academic_level', 'department_id', 'person_id', 'supervisor_name', 'supervisor_code', 'supervision_weeks', 'notes', 'data_source', 'archived_at'];
    protected function casts(): array { return ['supervision_weeks' => 'integer']; }
    public function department(): BelongsTo { return $this->belongsTo(Department::class); }
    public function person(): BelongsTo { return $this->belongsTo(Person::class); }
}

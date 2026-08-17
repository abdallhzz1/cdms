<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class StudyPlan extends Model
{
    protected $fillable = ['code', 'name_ar', 'name_en', 'is_active'];
    protected function casts(): array { return ['is_active' => 'boolean']; }
    public function courses(): BelongsToMany { return $this->belongsToMany(Course::class, 'course_study_plan')->withPivot(['academic_level','sequence','is_required'])->withTimestamps()->orderByPivot('sequence'); }
}

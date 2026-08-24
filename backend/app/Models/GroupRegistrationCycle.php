<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GroupRegistrationCycle extends Model
{
    use HasFactory;
    protected $fillable = ['academic_year_id', 'academic_level', 'public_id', 'status', 'default_capacity', 'opens_at', 'closes_at', 'created_by'];
    protected function casts(): array { return ['opens_at' => 'datetime', 'closes_at' => 'datetime']; }
    public function academicYear(): BelongsTo { return $this->belongsTo(AcademicYear::class); }
    public function rosters(): HasMany { return $this->hasMany(StudentGroupRoster::class); }
    public function isOpen(): bool
    {
        return $this->status === 'open'
            && (!$this->opens_at || $this->opens_at->isPast())
            && (!$this->closes_at || $this->closes_at->isFuture());
    }
}

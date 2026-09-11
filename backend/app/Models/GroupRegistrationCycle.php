<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GroupRegistrationCycle extends Model
{
    use HasFactory;
    protected $fillable = ['academic_year_id', 'academic_level', 'public_id', 'status', 'default_capacity', 'main_group_codes', 'opens_at', 'closes_at', 'created_by'];
    protected function casts(): array { return ['main_group_codes' => 'array', 'opens_at' => 'datetime', 'closes_at' => 'datetime']; }
    public function academicYear(): BelongsTo { return $this->belongsTo(AcademicYear::class); }
    public function rosters(): HasMany { return $this->hasMany(StudentGroupRoster::class); }
    /** @return array<int, string> */
    public function mainGroupCodes(): array
    {
        $codes = collect($this->main_group_codes)
            ->map(fn ($code) => strtoupper(trim((string) $code)))
            ->filter()
            ->values();

        if ($codes->isNotEmpty()) {
            return $codes->all();
        }

        return StudentGroup::query()
            ->where('academic_year_id', $this->academic_year_id)
            ->where('academic_level', $this->academic_level)
            ->where('group_type', 'self_registration')
            ->orderBy('name')
            ->pluck('name')
            ->map(fn ($code) => strtoupper(trim((string) $code)))
            ->filter()
            ->values()
            ->all();
    }
    public function isOpen(): bool
    {
        return $this->status === 'open'
            && (!$this->opens_at || $this->opens_at->isPast())
            && (!$this->closes_at || $this->closes_at->isFuture());
    }
}

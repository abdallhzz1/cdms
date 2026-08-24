<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property int $academic_year_id
 * @property string $academic_level  'fourth'|'fifth'|'sixth'
 * @property string $name            e.g. "A", "B", "G"
 * @property string|null $distribution_manager
 * @property \Carbon\Carbon|null $approved_at
 * @property string|null $notes
 */
class StudentGroup extends Model
{
    /** @use HasFactory<\Database\Factories\StudentGroupFactory> */
    use HasFactory;

    protected $fillable = [
        'academic_year_id',
        'academic_level',
        'name',
        'distribution_manager',
        'approved_at',
        'notes',
        'capacity',
        'group_type',
    ];

    protected function casts(): array
    {
        return [
            'approved_at' => 'date',
        ];
    }

    // -------------------------------------------------------------------------
    // Relationships
    // -------------------------------------------------------------------------

    /** @return BelongsTo<AcademicYear, $this> */
    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    /** @return HasMany<StudentSubgroup, $this> */
    public function subgroups(): HasMany
    {
        return $this->hasMany(StudentSubgroup::class);
    }

    /** @return HasMany<StudentGroupAssignment, $this> */
    public function assignments(): HasMany
    {
        return $this->hasMany(StudentGroupAssignment::class);
    }

    // -------------------------------------------------------------------------
    // Scopes
    // -------------------------------------------------------------------------

    /** @param Builder<StudentGroup> $query */
    public function scopeForLevel(Builder $query, string $level): void
    {
        $query->where('academic_level', $level);
    }

    /** @param Builder<StudentGroup> $query */
    public function scopeForYear(Builder $query, int $academicYearId): void
    {
        $query->where('academic_year_id', $academicYearId);
    }
}

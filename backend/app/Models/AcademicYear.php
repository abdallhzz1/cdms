<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $code
 * @property \Carbon\Carbon $start_date
 * @property \Carbon\Carbon $end_date
 * @property \Carbon\Carbon|null $semester1_start
 * @property \Carbon\Carbon|null $semester1_end
 * @property \Carbon\Carbon|null $semester2_start
 * @property \Carbon\Carbon|null $semester2_end
 * @property \Carbon\Carbon|null $summer_start
 * @property \Carbon\Carbon|null $summer_end
 * @property bool $is_current
 * @property string $status
 * @property string|null $notes
 */
class AcademicYear extends Model
{
    /** @use HasFactory<\Database\Factories\AcademicYearFactory> */
    use HasFactory;

    protected $fillable = [
        'code',
        'start_date',
        'end_date',
        'semester1_start',
        'semester1_end',
        'semester2_start',
        'semester2_end',
        'summer_start',
        'summer_end',
        'is_current',
        'status',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'start_date'      => 'date',
            'end_date'        => 'date',
            'semester1_start' => 'date',
            'semester1_end'   => 'date',
            'semester2_start' => 'date',
            'semester2_end'   => 'date',
            'summer_start'    => 'date',
            'summer_end'      => 'date',
            'is_current'      => 'boolean',
        ];
    }

    // -------------------------------------------------------------------------
    // Relationships
    // -------------------------------------------------------------------------

    /** @return HasMany<Student, $this> */
    public function students(): HasMany
    {
        return $this->hasMany(Student::class);
    }

    /** @return HasMany<StudentGroup, $this> */
    public function studentGroups(): HasMany
    {
        return $this->hasMany(StudentGroup::class);
    }

    public function rotations(): HasMany
    {
        return $this->hasMany(Rotation::class);
    }

    /** @return HasMany<StudentGroupAssignment, $this> */
    public function studentGroupAssignments(): HasMany
    {
        return $this->hasMany(StudentGroupAssignment::class);
    }

    // -------------------------------------------------------------------------
    // Scopes
    // -------------------------------------------------------------------------

    /** @param Builder<AcademicYear> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('status', 'active');
    }

    /** @param Builder<AcademicYear> $query */
    public function scopeCurrent(Builder $query): void
    {
        $query->where('is_current', true);
    }
}

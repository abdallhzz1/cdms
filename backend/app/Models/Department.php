<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $code
 * @property string $name_ar
 * @property string $name_en
 * @property string $dept_type  'primary'|'sub'
 * @property array|null $serves_academic_levels
 * @property bool $is_active
 * @property string|null $notes
 */
class Department extends Model
{
    /** @use HasFactory<\Database\Factories\DepartmentFactory> */
    use HasFactory;

    protected $fillable = [
        'code',
        'name_ar',
        'name_en',
        'dept_type',
        'serves_academic_levels',
        'is_active',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'serves_academic_levels' => 'array',
            'is_active'              => 'boolean',
        ];
    }

    // -------------------------------------------------------------------------
    // Relationships
    // -------------------------------------------------------------------------

    /** @return HasMany<Person, $this> */
    public function people(): HasMany
    {
        return $this->hasMany(Person::class);
    }

    /** @return HasMany<DepartmentHeadAssignment, $this> */
    public function headAssignments(): HasMany
    {
        return $this->hasMany(DepartmentHeadAssignment::class);
    }

    /** @return HasMany<TrainingSite, $this> */
    public function trainingSites(): HasMany
    {
        return $this->hasMany(TrainingSite::class);
    }

    public function rotations()
    {
        return $this->belongsToMany(Rotation::class);
    }

    public function rotationBlocks()
    {
        return $this->hasMany(RotationBlock::class);
    }

    // -------------------------------------------------------------------------
    // Convenience accessors
    // -------------------------------------------------------------------------

    /**
     * Current department head (role_type = 'head', is_current = true).
     *
     * @return DepartmentHeadAssignment|null
     */
    public function currentHead(): ?DepartmentHeadAssignment
    {
        return $this->headAssignments()
            ->with('person')
            ->where('role_type', 'head')
            ->where('is_current', true)
            ->first();
    }

    /**
     * Current RTA (role_type = 'rta', is_current = true).
     *
     * @return DepartmentHeadAssignment|null
     */
    public function currentRta(): ?DepartmentHeadAssignment
    {
        return $this->headAssignments()
            ->with('person')
            ->where('role_type', 'rta')
            ->where('is_current', true)
            ->first();
    }

    // -------------------------------------------------------------------------
    // Scopes
    // -------------------------------------------------------------------------

    /** @param Builder<Department> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /** @param Builder<Department> $query */
    public function scopePrimary(Builder $query): void
    {
        $query->where('dept_type', 'primary');
    }
}

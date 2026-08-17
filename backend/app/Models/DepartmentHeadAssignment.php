<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $person_id
 * @property int $department_id
 * @property string $role_type  'head'|'rta'
 * @property \Carbon\Carbon|null $started_at
 * @property \Carbon\Carbon|null $ended_at
 * @property bool $is_current
 * @property string|null $notes
 */
class DepartmentHeadAssignment extends Model
{
    /** @use HasFactory<\Database\Factories\DepartmentHeadAssignmentFactory> */
    use HasFactory;

    protected $fillable = [
        'person_id',
        'department_id',
        'role_type',
        'started_at',
        'ended_at',
        'is_current',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'date',
            'ended_at'   => 'date',
            'is_current' => 'boolean',
        ];
    }

    // -------------------------------------------------------------------------
    // Relationships
    // -------------------------------------------------------------------------

    /** @return BelongsTo<Person, $this> */
    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }

    /** @return BelongsTo<Department, $this> */
    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    // -------------------------------------------------------------------------
    // Scopes
    // -------------------------------------------------------------------------

    /** @param Builder<DepartmentHeadAssignment> $query */
    public function scopeCurrent(Builder $query): void
    {
        $query->where('is_current', true);
    }

    /** @param Builder<DepartmentHeadAssignment> $query */
    public function scopeHeads(Builder $query): void
    {
        $query->where('role_type', 'head');
    }

    /** @param Builder<DepartmentHeadAssignment> $query */
    public function scopeRtas(Builder $query): void
    {
        $query->where('role_type', 'rta');
    }
}

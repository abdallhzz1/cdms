<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property int $student_group_id
 * @property string $name   e.g. "A1", "B3", "G5"
 * @property int|null $min_size
 * @property int|null $max_size
 * @property bool $is_active
 */
class StudentSubgroup extends Model
{
    /** @use HasFactory<\Database\Factories\StudentSubgroupFactory> */
    use HasFactory;

    protected $fillable = [
        'student_group_id',
        'name',
        'min_size',
        'max_size',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    // -------------------------------------------------------------------------
    // Relationships
    // -------------------------------------------------------------------------

    /** @return BelongsTo<StudentGroup, $this> */
    public function group(): BelongsTo
    {
        return $this->belongsTo(StudentGroup::class, 'student_group_id');
    }

    /** @return HasMany<StudentGroupAssignment, $this> */
    public function assignments(): HasMany
    {
        return $this->hasMany(StudentGroupAssignment::class);
    }

    // -------------------------------------------------------------------------
    // Scopes
    // -------------------------------------------------------------------------

    /** @param Builder<StudentSubgroup> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }
}

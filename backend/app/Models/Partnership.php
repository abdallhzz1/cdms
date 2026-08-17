<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property string $institution_name
 * @property string|null $purpose
 * @property string $scope  'local'|'international'
 * @property \Carbon\Carbon|null $start_date
 * @property \Carbon\Carbon|null $end_date
 * @property bool $is_active
 * @property string|null $notes
 * @property string|null $data_source
 */
class Partnership extends Model
{
    /** @use HasFactory<\Database\Factories\PartnershipFactory> */
    use HasFactory;

    protected $fillable = [
        'institution_name',
        'purpose',
        'scope',
        'start_date',
        'end_date',
        'is_active',
        'notes',
        'data_source',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date'   => 'date',
            'is_active'  => 'boolean',
        ];
    }

    // -------------------------------------------------------------------------
    // Scopes
    // -------------------------------------------------------------------------

    /** @param Builder<Partnership> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /** @param Builder<Partnership> $query */
    public function scopeLocal(Builder $query): void
    {
        $query->where('scope', 'local');
    }

    /** @param Builder<Partnership> $query */
    public function scopeInternational(Builder $query): void
    {
        $query->where('scope', 'international');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * @property int $id
 * @property string $site_code
 * @property string $name_ar
 * @property string|null $name_en
 * @property string $site_type
 * @property string|null $city
 * @property string|null $address
 * @property float|null $latitude
 * @property float|null $longitude
 * @property float|null $distance_km
 * @property string|null $coordinator_name
 * @property string|null $coordinator_phone
 * @property string|null $coordinator_email
 * @property string|null $agreement_status
 * @property \Carbon\Carbon|null $agreement_start
 * @property \Carbon\Carbon|null $agreement_end
 * @property bool $has_university_transport
 * @property int|null $department_id
 * @property int|null $bed_count
 * @property int|null $max_students_per_period
 * @property int|null $max_students_per_doctor
 * @property string|null $training_days
 * @property bool $accepts_night_shifts
 * @property string|null $female_student_restrictions
 * @property bool $is_active
 * @property string|null $notes
 */
class TrainingSite extends Model
{
    /** @use HasFactory<\Database\Factories\TrainingSiteFactory> */
    use HasFactory;

    protected $fillable = [
        'site_code',
        'name_ar',
        'name_en',
        'site_type',
        'city',
        'address',
        'latitude',
        'longitude',
        'distance_km',
        'coordinator_name',
        'coordinator_phone',
        'coordinator_email',
        'agreement_status',
        'agreement_start',
        'agreement_end',
        'has_university_transport',
        'department_id',
        'bed_count',
        'max_students_per_period',
        'max_students_per_doctor',
        'training_days',
        'accepts_night_shifts',
        'female_student_restrictions',
        'is_active',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'agreement_start'         => 'date',
            'agreement_end'           => 'date',
            'has_university_transport' => 'boolean',
            'accepts_night_shifts'    => 'boolean',
            'is_active'               => 'boolean',
            'latitude'                => 'decimal:7',
            'longitude'               => 'decimal:7',
            'distance_km'             => 'decimal:2',
        ];
    }

    // -------------------------------------------------------------------------
    // Relationships
    // -------------------------------------------------------------------------

    /** @return BelongsTo<Department, $this> */
    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function capacityRules()
    {
        return $this->hasMany(SiteCapacityRule::class, 'site_id');
    }

    /** @return HasMany<Person, $this> */
    public function supervisors(): HasMany
    {
        return $this->hasMany(Person::class, 'primary_site_id');
    }

    public function clinicalSupervisors(): BelongsToMany
    {
        return $this->belongsToMany(Person::class, 'person_training_site')
            ->withPivot('is_primary')->withTimestamps();
    }

    // -------------------------------------------------------------------------
    // Scopes
    // -------------------------------------------------------------------------

    /** @param Builder<TrainingSite> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /** @param Builder<TrainingSite> $query */
    public function scopeOfType(Builder $query, string $type): void
    {
        $query->where('site_type', $type);
    }
}

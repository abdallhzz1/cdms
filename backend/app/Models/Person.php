<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * Person — the unified staff/people record.
 *
 * Represents any human with a professional role in the clinical department:
 * clinical supervisors, department heads, RTAs, academic advisors. One person
 * can hold multiple roles over time via DepartmentHeadAssignment records and
 * the Phase 2 role system attached to their optional user_id.
 *
 * @property int $id
 * @property string|null $staff_code
 * @property string $full_name_ar
 * @property string|null $full_name_en
 * @property string|null $email
 * @property string|null $phone
 * @property int|null $department_id
 * @property int|null $primary_site_id
 * @property string|null $specialty
 * @property string|null $academic_degree
 * @property string|null $license_number
 * @property string|null $contract_type
 * @property \Carbon\Carbon|null $contract_start
 * @property \Carbon\Carbon|null $contract_end
 * @property int|null $teaching_hours_per_week
 * @property string|null $available_days
 * @property int|null $max_students
 * @property string|null $photo_url
 * @property string|null $cv_url
 * @property bool $is_active
 * @property int|null $user_id
 * @property string|null $notes
 */
class Person extends Model
{
    /** @use HasFactory<\Database\Factories\PersonFactory> */
    use HasFactory;

    protected $fillable = [
        'staff_code',
        'full_name_ar',
        'full_name_en',
        'email',
        'phone',
        'department_id',
        'primary_site_id',
        'specialty',
        'academic_degree',
        'license_number',
        'contract_type',
        'contract_start',
        'contract_end',
        'teaching_hours_per_week',
        'available_days',
        'max_students',
        'photo_url',
        'cv_url',
        'is_active',
        'user_id',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'contract_start' => 'date',
            'contract_end'   => 'date',
            'is_active'      => 'boolean',
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

    /** @return BelongsTo<TrainingSite, $this> */
    public function primarySite(): BelongsTo
    {
        return $this->belongsTo(TrainingSite::class, 'primary_site_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<DepartmentHeadAssignment, $this> */
    public function headAssignments(): HasMany
    {
        return $this->hasMany(DepartmentHeadAssignment::class);
    }

    /** @return HasMany<Student, $this> */
    public function advisedStudents(): HasMany
    {
        return $this->hasMany(Student::class, 'academic_advisor_id');
    }

    public function activityRecords(): HasMany
    {
        return $this->hasMany(StaffActivityRecord::class);
    }

    public function availabilities(): HasMany
    {
        return $this->hasMany(SupervisorAvailability::class);
    }

    // -------------------------------------------------------------------------
    // Scopes
    // -------------------------------------------------------------------------

    /** @param Builder<Person> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /** @param Builder<Person> $query */
    public function scopeInDepartment(Builder $query, int $departmentId): void
    {
        $query->where('department_id', $departmentId);
    }
}

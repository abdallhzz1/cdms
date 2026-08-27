<?php

namespace App\Models;

use Carbon\Carbon;
use Database\Factories\StudentFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Student — the primary academic subject of the CDMS.
 *
 * Students are NOT system users. They have no login. They are data subjects
 * whose records are managed by staff with the appropriate role/permission.
 *
 * @property int $id
 * @property string $university_number
 * @property string $full_name_ar
 * @property string|null $full_name_en
 * @property string|null $national_id
 * @property string|null $gender 'male'|'female'
 * @property Carbon|null $date_of_birth
 * @property string|null $city
 * @property string|null $phone
 * @property string|null $guardian_phone
 * @property string|null $university_email
 * @property string|null $photo_url
 * @property int|null $batch_year
 * @property string $academic_level 'fourth'|'fifth'|'sixth'
 * @property int|null $academic_year_id
 * @property string|null $study_plan_code
 * @property string $registration_status
 * @property float|null $gpa
 * @property int|null $credit_hours_passed
 * @property int $warning_count
 * @property Carbon|null $last_warning_date
 * @property int|null $academic_advisor_id
 * @property string $clinical_fees_status
 * @property bool $has_amboss_subscription
 * @property string|null $notes
 * @property string|null $data_source
 */
class Student extends Model
{
    /** @use HasFactory<StudentFactory> */
    use HasFactory;

    protected $fillable = [
        'university_number',
        'full_name_ar',
        'full_name_en',
        'national_id',
        'gender',
        'date_of_birth',
        'city',
        'phone',
        'guardian_phone',
        'university_email',
        'photo_url',
        'batch_year',
        'academic_level',
        'academic_year_id',
        'study_plan_code',
        'registration_status',
        'academic_registration_status',
        'gpa',
        'credit_hours_passed',
        'warning_count',
        'last_warning_date',
        'academic_advisor_id',
        'clinical_fees_status',
        'has_amboss_subscription',
        'notes',
        'data_source',
    ];

    protected function casts(): array
    {
        return [
            'date_of_birth' => 'date',
            'last_warning_date' => 'date',
            'gpa' => 'decimal:2',
            'has_amboss_subscription' => 'boolean',
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

    public function groupRegistrationRosters(): HasMany
    {
        return $this->hasMany(StudentGroupRoster::class)->orderByDesc('group_registration_cycle_id');
    }

    public function advisingRecords(): HasMany
    {
        return $this->hasMany(AdvisingRecord::class);
    }

    /** @return BelongsTo<Person, $this> */
    public function academicAdvisor(): BelongsTo
    {
        return $this->belongsTo(Person::class, 'academic_advisor_id');
    }

    /** @return HasMany<StudentGroupAssignment, $this> */
    public function groupAssignments(): HasMany
    {
        return $this->hasMany(StudentGroupAssignment::class);
    }

    /**
     * Current active group assignment (valid_until IS NULL or in future).
     *
     * @return HasMany<StudentGroupAssignment, $this>
     */
    public function currentGroupAssignments(): HasMany
    {
        return $this->hasMany(StudentGroupAssignment::class)
            ->whereNull('valid_until');
    }

    // -------------------------------------------------------------------------
    // Scopes
    // -------------------------------------------------------------------------

    /** @param Builder<Student> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('registration_status', 'active');
    }

    /** @param Builder<Student> $query */
    public function scopeForLevel(Builder $query, string $level): void
    {
        $query->where('academic_level', $level);
    }

    /** @param Builder<Student> $query */
    public function scopeForYear(Builder $query, int $academicYearId): void
    {
        $query->where('academic_year_id', $academicYearId);
    }

    /** @param Builder<Student> $query */
    public function scopeAtRisk(Builder $query): void
    {
        $query->where('warning_count', '>', 0);
    }

    /**
     * Recalculate student GPA & Passed Credit Hours dynamically.
     */
    public function recalculateGpa(): void
    {
        $enrollments = StudentCourseEnrollment::where('student_id', $this->id)
            ->with(['course', 'gradeEntry'])
            ->get();

        $initialGpa = $this->gpa ?? 0;
        $initialHours = $this->credit_hours_passed ?? 0;

        $totalPoints = $initialGpa * $initialHours;
        $totalHours = $initialHours;

        foreach ($enrollments as $enrollment) {
            $grade = $enrollment->gradeEntry;
            $course = $enrollment->course;
            if ($grade && $grade->status === 'approved' && $grade->score !== null && $course && $course->credit_hours) {
                $percentage = ($grade->score / $grade->max_score) * 100;
                $creditHours = (int) $course->credit_hours;

                $totalPoints += ($percentage * $creditHours);
                $totalHours += $creditHours;
            }
        }

        if ($totalHours > 0) {
            $newGpa = round($totalPoints / $totalHours, 2);
            $this->update([
                'gpa' => $newGpa,
                'credit_hours_passed' => $totalHours,
            ]);
        }
    }
}

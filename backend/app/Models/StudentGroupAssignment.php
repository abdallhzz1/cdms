<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property string|null $assignment_code
 * @property int $student_id
 * @property int $academic_year_id
 * @property int $student_group_id
 * @property int|null $student_subgroup_id
 * @property \Carbon\Carbon|null $valid_from
 * @property \Carbon\Carbon|null $valid_until
 * @property string|null $rotation
 * @property string|null $change_reason
 * @property string|null $approved_by
 * @property string|null $notes
 * @property string|null $data_source
 */
class StudentGroupAssignment extends Model
{
    /** @use HasFactory<\Database\Factories\StudentGroupAssignmentFactory> */
    use HasFactory;

    protected $fillable = [
        'assignment_code',
        'student_id',
        'academic_year_id',
        'student_group_id',
        'student_subgroup_id',
        'valid_from',
        'valid_until',
        'rotation',
        'change_reason',
        'approved_by',
        'notes',
        'data_source',
    ];

    protected function casts(): array
    {
        return [
            'valid_from'  => 'date',
            'valid_until' => 'date',
        ];
    }

    // -------------------------------------------------------------------------
    // Relationships
    // -------------------------------------------------------------------------

    /** @return BelongsTo<Student, $this> */
    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    /** @return BelongsTo<AcademicYear, $this> */
    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    /** @return BelongsTo<StudentGroup, $this> */
    public function group(): BelongsTo
    {
        return $this->belongsTo(StudentGroup::class, 'student_group_id');
    }

    /** @return BelongsTo<StudentSubgroup, $this> */
    public function subgroup(): BelongsTo
    {
        return $this->belongsTo(StudentSubgroup::class, 'student_subgroup_id');
    }
}

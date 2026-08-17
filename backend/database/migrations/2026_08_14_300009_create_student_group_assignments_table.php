<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Student group assignments — source: workbook sheet 8 (07_تكليفات_الطلاب_بالمجموعات).
 *
 * This is the time-bound membership record linking a Student to a SubGroup.
 * Key design decisions:
 *
 * 1. TEMPORAL RANGE: valid_from / valid_until allow a student to change groups
 *    (e.g. if they repeat a year or are transferred) without losing history.
 *    A NULL valid_until means "still current in this group".
 *
 * 2. ASSIGNMENT CODE: assignment_code (SGA-0001) is the natural key from the
 *    workbook and will be used in future import reconciliation.
 *
 * 3. STUDENT_SUBGROUP_ID nullable: some assignment rows in the workbook have
 *    only a main group assigned (no sub-group yet). The sub-group assignment
 *    may be filled in later when the distribution is finalized.
 *
 * 4. ROTATION: stored as nullable text in Phase 3A. In Phase 3B it will become
 *    a FK to a rotations table. Keeping it as text avoids blocking Phase 3A on
 *    the rotation model definition.
 *
 * 5. RESTRICT on all FKs: assignment records are historically significant and
 *    must not be silently deleted when a group, student, or year is removed.
 *
 * The composite index (student_id, academic_year_id) covers the common query
 * "what group is this student in this year?"
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_group_assignments', function (Blueprint $table) {
            $table->id();

            // Natural key from workbook (SGA-0001 etc.) — nullable for manually
            // created assignments that did not originate from the workbook import
            $table->string('assignment_code', 20)->nullable()->unique()->index();

            $table->foreignId('student_id')
                ->constrained('students')->restrictOnDelete();

            $table->foreignId('academic_year_id')
                ->constrained('academic_years')->restrictOnDelete();

            $table->foreignId('student_group_id')
                ->constrained('student_groups')->restrictOnDelete();

            // Nullable: sub-group may be assigned later after main group is set
            $table->foreignId('student_subgroup_id')
                ->nullable()
                ->constrained('student_subgroups')->restrictOnDelete();

            // Temporal validity — NULL valid_until = currently active
            $table->date('valid_from')->nullable();
            $table->date('valid_until')->nullable();

            // Rotation text placeholder — becomes FK in Phase 3B
            $table->string('rotation')->nullable();

            $table->text('change_reason')->nullable();
            $table->string('approved_by')->nullable();
            $table->text('notes')->nullable();
            $table->string('data_source')->nullable();
            $table->timestamps();

            // Common query: find all assignments for student in a given year
            $table->index(['student_id', 'academic_year_id'], 'idx_student_year');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_group_assignments');
    }
};

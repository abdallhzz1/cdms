<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('course_schedule_cells', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('distribution_version_id');
            $table->unsignedBigInteger('course_schedule_row_id');
            $table->unsignedBigInteger('rotation_block_id');
            $table->unsignedBigInteger('student_subgroup_id');
            $table->timestamps();

            $table->foreign('distribution_version_id', 'csc_version_fk')->references('id')->on('distribution_versions')->cascadeOnDelete();
            $table->foreign('course_schedule_row_id', 'csc_row_fk')->references('id')->on('course_schedule_rows')->cascadeOnDelete();
            $table->foreign('rotation_block_id', 'csc_block_fk')->references('id')->on('rotation_blocks')->cascadeOnDelete();
            $table->foreign('student_subgroup_id', 'csc_subgroup_fk')->references('id')->on('student_subgroups')->cascadeOnDelete();
            $table->unique(['distribution_version_id', 'course_schedule_row_id', 'rotation_block_id'], 'csc_row_block_uq');
            $table->unique(['distribution_version_id', 'rotation_block_id', 'student_subgroup_id'], 'csc_group_block_uq');
        });

        $now = now();
        DB::table('student_clinical_assignments')
            ->whereNotNull('course_schedule_row_id')
            ->whereNotNull('student_subgroup_id')
            ->select(['distribution_version_id', 'course_schedule_row_id', 'rotation_block_id', 'student_subgroup_id'])
            ->distinct()
            ->orderBy('distribution_version_id')
            ->chunk(500, function ($assignments) use ($now) {
                DB::table('course_schedule_cells')->insertOrIgnore($assignments->map(fn ($assignment) => [
                    'distribution_version_id' => $assignment->distribution_version_id,
                    'course_schedule_row_id' => $assignment->course_schedule_row_id,
                    'rotation_block_id' => $assignment->rotation_block_id,
                    'student_subgroup_id' => $assignment->student_subgroup_id,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])->all());
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('course_schedule_cells');
    }
};

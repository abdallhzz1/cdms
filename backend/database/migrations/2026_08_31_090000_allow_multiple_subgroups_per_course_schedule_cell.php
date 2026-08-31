<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('course_schedule_cells', function (Blueprint $table) {
            $table->dropUnique('csc_row_block_uq');
            $table->unique(
                ['distribution_version_id', 'course_schedule_row_id', 'rotation_block_id', 'student_subgroup_id'],
                'csc_row_block_subgroup_uq'
            );
        });
    }

    public function down(): void
    {
        Schema::table('course_schedule_cells', function (Blueprint $table) {
            $table->dropUnique('csc_row_block_subgroup_uq');
            $table->unique(
                ['distribution_version_id', 'course_schedule_row_id', 'rotation_block_id'],
                'csc_row_block_uq'
            );
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('course_assessment_components', function (Blueprint $table) {
            $table->string('assessment_frequency', 16)->nullable();
            $table->decimal('mini_osce_max_score', 8, 2)->default(0);
            $table->string('osce_entry_mode', 16)->nullable();
        });
        Schema::table('clinical_assessments', function (Blueprint $table) {
            $table->string('assessment_kind', 16)->default('weekly');
            $table->unsignedTinyInteger('period_guard')->nullable();
            $table->unique(['student_clinical_assignment_id', 'evaluator_person_id', 'period_guard'], 'ca_period_guard_uq');
        });
        Schema::create('clinical_mini_osce_scores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained()->restrictOnDelete();
            $table->foreignId('rotation_block_id')->constrained()->restrictOnDelete();
            $table->foreignId('entered_by_person_id')->constrained('people')->restrictOnDelete();
            $table->decimal('score', 8, 2);
            $table->decimal('max_score', 8, 2);
            $table->timestamps();
            $table->unique(['student_id', 'rotation_block_id'], 'mini_osce_student_block_uq');
        });
        Schema::table('grade_entries', function (Blueprint $table) {
            $table->foreignId('osce_recorded_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->json('osce_committee_snapshot')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('grade_entries', fn (Blueprint $table) => $table->dropConstrainedForeignId('osce_recorded_by_user_id'));
        Schema::table('grade_entries', fn (Blueprint $table) => $table->dropColumn('osce_committee_snapshot'));
        Schema::dropIfExists('clinical_mini_osce_scores');
        Schema::table('clinical_assessments', function (Blueprint $table) {
            $table->dropUnique('ca_period_guard_uq');
            $table->dropColumn(['assessment_kind', 'period_guard']);
        });
        Schema::table('course_assessment_components', fn (Blueprint $table) => $table->dropColumn(['assessment_frequency', 'mini_osce_max_score', 'osce_entry_mode']));
    }
};

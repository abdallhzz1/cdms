<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('quality_surveys', function (Blueprint $table) {
            $table->json('target_levels')->nullable();
        });

        Schema::create('quality_survey_audience_students', function (Blueprint $table) {
            $table->id();
            $table->foreignId('quality_survey_id')->constrained()->cascadeOnDelete();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->string('academic_level', 20);
            $table->unique(['quality_survey_id', 'student_id'], 'quality_survey_audience_student_unique');
            $table->index(['quality_survey_id', 'academic_level'], 'quality_survey_audience_level_index');
        });

        Schema::create('quality_survey_participations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('quality_survey_id')->constrained()->cascadeOnDelete();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->date('completed_on');
            $table->unique(['quality_survey_id', 'student_id'], 'quality_survey_participation_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('quality_survey_participations');
        Schema::dropIfExists('quality_survey_audience_students');
        Schema::table('quality_surveys', fn (Blueprint $table) => $table->dropColumn('target_levels'));
    }
};

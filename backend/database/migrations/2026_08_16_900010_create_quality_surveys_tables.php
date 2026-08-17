<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quality_surveys', function (Blueprint $table) {
            $table->id(); $table->string('code')->unique(); $table->string('title'); $table->string('target_group');
            $table->text('purpose')->nullable(); $table->string('frequency')->nullable(); $table->string('responsible')->nullable();
            $table->string('form_url')->nullable(); $table->boolean('is_mandatory')->default(false); $table->text('notes')->nullable(); $table->boolean('is_active')->default(true); $table->timestamps();
        });
        Schema::create('quality_survey_questions', function (Blueprint $table) {
            $table->id(); $table->foreignId('quality_survey_id')->constrained()->cascadeOnDelete(); $table->string('version')->default('1');
            $table->unsignedInteger('question_number'); $table->text('question_text'); $table->string('question_type'); $table->text('options')->nullable();
            $table->boolean('is_required')->default(false); $table->decimal('weight', 6, 2)->nullable(); $table->string('axis')->nullable(); $table->date('active_from')->nullable(); $table->date('active_until')->nullable(); $table->timestamps();
            $table->unique(['quality_survey_id', 'version', 'question_number'], 'quality_survey_question_version_unique');
        });
        Schema::create('quality_survey_responses', function (Blueprint $table) {
            $table->id(); $table->foreignId('quality_survey_id')->constrained()->cascadeOnDelete(); $table->foreignId('quality_survey_question_id')->constrained()->cascadeOnDelete();
            $table->string('version')->default('1'); $table->timestamp('responded_at'); $table->string('respondent_identifier')->nullable(); $table->string('target_group')->nullable();
            $table->foreignId('course_id')->nullable()->constrained()->nullOnDelete(); $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete(); $table->foreignId('training_site_id')->nullable()->constrained()->nullOnDelete(); $table->foreignId('supervisor_person_id')->nullable()->constrained('people')->nullOnDelete();
            $table->decimal('numeric_answer', 10, 2)->nullable(); $table->text('text_answer')->nullable(); $table->timestamps();
        });
    }
    public function down(): void { Schema::dropIfExists('quality_survey_responses'); Schema::dropIfExists('quality_survey_questions'); Schema::dropIfExists('quality_surveys'); }
};

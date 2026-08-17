<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('evaluation_form_versions', function (Blueprint $table) {
            $table->id(); $table->string('form_code'); $table->string('name'); $table->string('version');
            $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('course_id')->nullable()->constrained()->nullOnDelete();
            $table->string('evaluator_type')->nullable(); $table->string('evaluatee_type')->nullable();
            $table->date('effective_from')->nullable(); $table->date('effective_until')->nullable();
            $table->decimal('total_score', 8, 2)->nullable(); $table->string('status')->default('active');
            $table->string('document_path')->nullable(); $table->text('notes')->nullable(); $table->string('data_source')->nullable(); $table->timestamps();
            $table->unique(['form_code', 'version']);
        });
        Schema::create('evaluation_form_items', function (Blueprint $table) {
            $table->id(); $table->foreignId('evaluation_form_version_id')->nullable()->constrained()->nullOnDelete();
            $table->string('item_code')->unique(); $table->text('item_text'); $table->string('domain')->nullable();
            $table->string('rating_scale')->nullable(); $table->decimal('weight', 8, 2)->nullable();
            $table->string('program_outcome_code')->nullable(); $table->string('applicable_courses')->nullable();
            $table->text('notes')->nullable(); $table->string('data_source')->nullable(); $table->timestamps();
        });
    }
    public function down(): void { Schema::dropIfExists('evaluation_form_items'); Schema::dropIfExists('evaluation_form_versions'); }
};

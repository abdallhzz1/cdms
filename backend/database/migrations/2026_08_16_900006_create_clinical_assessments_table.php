<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinical_assessments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained()->restrictOnDelete();
            $table->foreignId('clinical_session_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('evaluator_person_id')->nullable()->constrained('people')->nullOnDelete();
            $table->decimal('score', 6, 2)->nullable();
            $table->decimal('max_score', 6, 2)->default(100);
            $table->string('status')->default('draft');
            $table->text('notes')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinical_assessments');
    }
};

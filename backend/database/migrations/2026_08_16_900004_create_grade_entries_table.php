<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration { public function up(): void { Schema::create('grade_entries', function (Blueprint $table) { $table->id(); $table->foreignId('student_course_enrollment_id')->constrained()->restrictOnDelete(); $table->decimal('score',5,2)->nullable(); $table->decimal('max_score',5,2)->default(100); $table->string('status')->default('draft'); $table->text('notes')->nullable(); $table->timestamps(); $table->unique('student_course_enrollment_id'); }); } public function down(): void { Schema::dropIfExists('grade_entries'); } };

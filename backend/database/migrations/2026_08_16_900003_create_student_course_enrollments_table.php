<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration { public function up(): void { Schema::create('student_course_enrollments', function (Blueprint $table) { $table->id(); $table->foreignId('student_id')->constrained()->restrictOnDelete(); $table->foreignId('course_id')->constrained()->restrictOnDelete(); $table->foreignId('academic_year_id')->constrained()->restrictOnDelete(); $table->string('semester', 20); $table->string('status')->default('enrolled'); $table->timestamps(); $table->unique(['student_id','course_id','academic_year_id','semester'], 'student_course_year_semester_unique'); }); } public function down(): void { Schema::dropIfExists('student_course_enrollments'); } };

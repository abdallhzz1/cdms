<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('clinical_university_lectures', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_group_id')->constrained('student_groups')->restrictOnDelete();
            $table->foreignId('supervisor_person_id')->constrained('people')->restrictOnDelete();
            $table->string('title', 160);
            $table->string('weekday', 12);
            $table->time('starts_at');
            $table->time('ends_at');
            $table->date('starts_on');
            $table->date('ends_on');
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['student_group_id', 'is_active', 'starts_on', 'ends_on'], 'university_lectures_group_dates_idx');
            $table->index(['supervisor_person_id', 'is_active', 'starts_on', 'ends_on'], 'university_lectures_supervisor_dates_idx');
        });

        Schema::create('clinical_university_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinical_university_lecture_id')->constrained('clinical_university_lectures')->restrictOnDelete();
            $table->date('session_date');
            $table->foreignId('supervisor_person_id')->constrained('people')->restrictOnDelete();
            $table->foreignId('recorded_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['clinical_university_lecture_id', 'session_date'], 'university_session_lecture_date_unique');
        });

        Schema::create('clinical_university_attendance_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinical_university_session_id')->constrained('clinical_university_sessions')->restrictOnDelete();
            $table->foreignId('student_id')->constrained('students')->restrictOnDelete();
            $table->foreignId('student_subgroup_id')->nullable()->constrained('student_subgroups')->nullOnDelete();
            $table->string('status', 16);
            $table->text('excuse_note')->nullable();
            $table->foreignId('recorded_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['clinical_university_session_id', 'student_id'], 'university_attendance_student_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinical_university_attendance_records');
        Schema::dropIfExists('clinical_university_sessions');
        Schema::dropIfExists('clinical_university_lectures');
    }
};

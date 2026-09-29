<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('basic_courses', function (Blueprint $t) {
            $t->id(); $t->string('code', 40)->unique(); $t->string('name', 255);
            $t->string('academic_level', 20); $t->boolean('is_active')->default(true); $t->timestamps();
        });
        Schema::create('basic_sections', function (Blueprint $t) {
            $t->id(); $t->foreignId('course_id')->constrained('basic_courses')->restrictOnDelete();
            $t->string('number', 30); $t->string('academic_year', 30); $t->string('semester', 20);
            $t->boolean('is_active')->default(true); $t->timestamps();
            $t->unique(['course_id', 'number', 'academic_year', 'semester'], 'basic_section_uq');
        });
        Schema::create('basic_section_lecturers', function (Blueprint $t) {
            $t->foreignId('section_id')->constrained('basic_sections')->cascadeOnDelete();
            $t->foreignId('user_id')->constrained('users')->cascadeOnDelete(); $t->primary(['section_id', 'user_id'], 'basic_lecturer_pk');
        });
        Schema::create('basic_students', function (Blueprint $t) {
            $t->id(); $t->string('university_number', 20)->unique(); $t->string('name', 255);
            $t->string('email', 255)->unique(); $t->string('photo_url', 1000)->nullable();
            $t->boolean('is_active')->default(true); $t->timestamps();
        });
        Schema::create('basic_enrollments', function (Blueprint $t) {
            $t->id(); $t->foreignId('section_id')->constrained('basic_sections')->restrictOnDelete();
            $t->foreignId('student_id')->constrained('basic_students')->restrictOnDelete();
            $t->boolean('is_active')->default(true); $t->timestamps(); $t->unique(['section_id', 'student_id'], 'basic_enroll_uq');
        });
        Schema::create('basic_lecture_sessions', function (Blueprint $t) {
            $t->id(); $t->uuid('public_id')->unique(); $t->foreignId('section_id')->constrained('basic_sections')->restrictOnDelete();
            $t->foreignId('created_by')->constrained('users')->restrictOnDelete(); $t->string('title', 150);
            $t->string('state', 20); $t->string('mode', 20); $t->unsignedTinyInteger('active_guard')->nullable();
            $t->unsignedInteger('version')->default(1); $t->unsignedSmallInteger('window_minutes')->default(5);
            $t->unsignedSmallInteger('late_after_minutes')->default(2); $t->timestamp('opened_at');
            $t->timestamp('phase_expires_at')->nullable(); $t->timestamp('finalized_at')->nullable(); $t->timestamps();
            $t->unique(['section_id', 'active_guard'], 'basic_active_session_uq');
        });
        Schema::create('basic_lecture_records', function (Blueprint $t) {
            $t->id(); $t->foreignId('session_id')->constrained('basic_lecture_sessions')->restrictOnDelete();
            $t->foreignId('student_id')->constrained('basic_students')->restrictOnDelete();
            $t->timestamp('check_in_at')->nullable(); $t->timestamp('check_out_at')->nullable();
            $t->boolean('is_late')->default(false); $t->string('status', 20)->default('pending');
            $t->string('source', 20)->default('qr'); $t->text('reason')->nullable(); $t->timestamps();
            $t->unique(['session_id', 'student_id'], 'basic_record_uq');
        });
        Schema::create('basic_otp_challenges', function (Blueprint $t) {
            $t->id(); $t->foreignId('student_id')->constrained('basic_students')->cascadeOnDelete();
            $t->char('token_hash', 64)->unique(); $t->string('otp_hash'); $t->unsignedTinyInteger('attempts')->default(0);
            $t->timestamp('expires_at'); $t->timestamp('consumed_at')->nullable();
            $t->foreignId('pending_session_id')->nullable()->constrained('basic_lecture_sessions')->nullOnDelete();
            $t->unsignedInteger('pending_version')->nullable(); $t->string('pending_phase', 20)->nullable(); $t->timestamps();
        });
        Schema::create('basic_trusted_devices', function (Blueprint $t) {
            $t->id(); $t->foreignId('student_id')->constrained('basic_students')->cascadeOnDelete();
            $t->char('token_hash', 64)->unique(); $t->timestamp('expires_at'); $t->timestamp('revoked_at')->nullable(); $t->timestamps();
        });
        Schema::create('basic_attendance_audits', function (Blueprint $t) {
            $t->id(); $t->foreignId('session_id')->nullable()->constrained('basic_lecture_sessions')->restrictOnDelete();
            $t->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('event', 50); $t->json('details'); $t->timestamp('created_at');
        });
        (new \Database\Seeders\BasicAttendancePermissionSeeder)->run();
    }

    public function down(): void
    {
        foreach (['basic_attendance_audits', 'basic_trusted_devices', 'basic_otp_challenges', 'basic_lecture_records', 'basic_lecture_sessions', 'basic_enrollments', 'basic_students', 'basic_section_lecturers', 'basic_sections', 'basic_courses'] as $table) Schema::dropIfExists($table);
    }
};

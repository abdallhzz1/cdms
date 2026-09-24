<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinical_qr_attendance_sessions', function (Blueprint $table) {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->string('assignment_key', 120);
            $table->foreignId('student_clinical_assignment_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rotation_block_id')->constrained()->restrictOnDelete();
            $table->foreignId('training_site_id')->constrained()->restrictOnDelete();
            $table->foreignId('supervisor_id')->nullable()->constrained('people')->nullOnDelete();
            $table->foreignId('clinical_session_id')->nullable()->constrained()->nullOnDelete();
            $table->date('session_date');
            $table->string('state', 24);
            $table->unsignedTinyInteger('active_guard')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->timestamp('check_in_opened_at')->nullable();
            $table->timestamp('check_in_closed_at')->nullable();
            $table->timestamp('check_out_opened_at')->nullable();
            $table->timestamp('check_out_closed_at')->nullable();
            $table->timestamp('finalized_at')->nullable();
            $table->foreignId('finalized_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['assignment_key', 'session_date', 'active_guard'], 'clinical_qr_active_session_unique');
            $table->index(['supervisor_id', 'session_date', 'state']);
        });

        Schema::create('clinical_qr_attendance_roster', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinical_qr_attendance_session_id')->constrained()->cascadeOnDelete();
            $table->foreignId('student_id')->constrained()->restrictOnDelete();
            $table->timestamp('checked_in_at')->nullable();
            $table->timestamp('checked_out_at')->nullable();
            $table->string('outcome', 16)->default('not_checked_in');
            $table->string('recording_source', 24)->default('qr');
            $table->boolean('is_incomplete')->default(false);
            $table->text('manual_reason')->nullable();
            $table->foreignId('manual_actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['clinical_qr_attendance_session_id', 'student_id'], 'clinical_qr_roster_student_unique');
            $table->index(['student_id', 'outcome']);
        });

        Schema::create('clinical_qr_scan_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinical_qr_attendance_session_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('student_id')->nullable()->constrained()->nullOnDelete();
            $table->string('phase', 16)->nullable();
            $table->string('result_code', 40);
            $table->string('qr_nonce_hash', 64)->nullable();
            $table->string('ip_hash', 64)->nullable();
            $table->string('user_agent', 500)->nullable();
            $table->timestamp('occurred_at');
            $table->index(['clinical_qr_attendance_session_id', 'occurred_at']);
            $table->index(['student_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinical_qr_scan_events');
        Schema::dropIfExists('clinical_qr_attendance_roster');
        Schema::dropIfExists('clinical_qr_attendance_sessions');
    }
};

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
            $table->unsignedBigInteger('student_clinical_assignment_id');
            $table->unsignedBigInteger('rotation_block_id');
            $table->unsignedBigInteger('training_site_id');
            $table->unsignedBigInteger('supervisor_id')->nullable();
            $table->unsignedBigInteger('clinical_session_id')->nullable();
            $table->date('session_date');
            $table->string('state', 24);
            $table->unsignedTinyInteger('active_guard')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->timestamp('check_in_opened_at')->nullable();
            $table->timestamp('check_in_closed_at')->nullable();
            $table->timestamp('check_out_opened_at')->nullable();
            $table->timestamp('check_out_closed_at')->nullable();
            $table->timestamp('finalized_at')->nullable();
            $table->unsignedBigInteger('finalized_by_user_id')->nullable();
            $table->timestamps();
            $table->unique(['assignment_key', 'session_date', 'active_guard'], 'clinical_qr_active_session_unique');
            $table->index(['supervisor_id', 'session_date', 'state'], 'qr_session_supervisor_date_idx');
            $table->foreign('student_clinical_assignment_id', 'qr_attendance_assignment_fk')->references('id')->on('student_clinical_assignments')->cascadeOnDelete();
            $table->foreign('rotation_block_id', 'qr_attendance_block_fk')->references('id')->on('rotation_blocks')->restrictOnDelete();
            $table->foreign('training_site_id', 'qr_attendance_site_fk')->references('id')->on('training_sites')->restrictOnDelete();
            $table->foreign('supervisor_id', 'qr_attendance_supervisor_fk')->references('id')->on('people')->nullOnDelete();
            $table->foreign('clinical_session_id', 'qr_attendance_clinical_session_fk')->references('id')->on('clinical_sessions')->nullOnDelete();
            $table->foreign('finalized_by_user_id', 'qr_attendance_finalizer_fk')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('clinical_qr_attendance_roster', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('clinical_qr_attendance_session_id');
            $table->unsignedBigInteger('student_id');
            $table->timestamp('checked_in_at')->nullable();
            $table->timestamp('checked_out_at')->nullable();
            $table->string('outcome', 16)->default('not_checked_in');
            $table->string('recording_source', 24)->default('qr');
            $table->boolean('is_incomplete')->default(false);
            $table->text('manual_reason')->nullable();
            $table->unsignedBigInteger('manual_actor_user_id')->nullable();
            $table->timestamps();
            $table->unique(['clinical_qr_attendance_session_id', 'student_id'], 'clinical_qr_roster_student_unique');
            $table->index(['student_id', 'outcome'], 'qr_roster_student_outcome_idx');
            $table->foreign('clinical_qr_attendance_session_id', 'qr_roster_session_fk')->references('id')->on('clinical_qr_attendance_sessions')->cascadeOnDelete();
            $table->foreign('student_id', 'qr_roster_student_fk')->references('id')->on('students')->restrictOnDelete();
            $table->foreign('manual_actor_user_id', 'qr_roster_actor_fk')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('clinical_qr_scan_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('clinical_qr_attendance_session_id')->nullable();
            $table->unsignedBigInteger('student_id')->nullable();
            $table->string('phase', 16)->nullable();
            $table->string('result_code', 40);
            $table->string('qr_nonce_hash', 64)->nullable();
            $table->string('ip_hash', 64)->nullable();
            $table->string('user_agent', 500)->nullable();
            $table->timestamp('occurred_at');
            $table->index(['clinical_qr_attendance_session_id', 'occurred_at'], 'qr_scan_session_time_idx');
            $table->index(['student_id', 'occurred_at'], 'qr_scan_student_time_idx');
            $table->foreign('clinical_qr_attendance_session_id', 'qr_scan_session_fk')->references('id')->on('clinical_qr_attendance_sessions')->nullOnDelete();
            $table->foreign('student_id', 'qr_scan_student_fk')->references('id')->on('students')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinical_qr_scan_events');
        Schema::dropIfExists('clinical_qr_attendance_roster');
        Schema::dropIfExists('clinical_qr_attendance_sessions');
    }
};

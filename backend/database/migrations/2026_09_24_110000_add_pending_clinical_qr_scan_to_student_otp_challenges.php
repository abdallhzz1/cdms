<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('student_schedule_otp_challenges', function (Blueprint $table) {
            $table->string('pending_clinical_qr_hash', 64)->nullable()->after('access_expires_at');
            $table->timestamp('pending_clinical_qr_expires_at')->nullable()->after('pending_clinical_qr_hash');
            $table->index('pending_clinical_qr_hash', 'student_otp_pending_qr_idx');
        });
    }

    public function down(): void
    {
        Schema::table('student_schedule_otp_challenges', function (Blueprint $table) {
            $table->dropIndex('student_otp_pending_qr_idx');
            $table->dropColumn(['pending_clinical_qr_hash', 'pending_clinical_qr_expires_at']);
        });
    }
};

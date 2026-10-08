<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('basic_scan_claims', function (Blueprint $table) {
            $table->id();
            $table->foreignId('session_id')->constrained('basic_lecture_sessions', 'id', 'basic_claim_session_fk')->restrictOnDelete();
            $table->foreignId('student_id')->nullable()->constrained('basic_students', 'id', 'basic_claim_student_fk')->nullOnDelete();
            $table->char('token_hash', 64)->unique('basic_claim_token_uq');
            $table->string('phase', 20);
            $table->unsignedInteger('version');
            $table->timestamp('scanned_at');
            $table->timestamp('expires_at')->index('basic_claim_expiry_idx');
            $table->timestamp('consumed_at')->nullable();
            $table->timestamps();
        });

        Schema::table('basic_otp_challenges', function (Blueprint $table) {
            $table->foreignId('scan_claim_id')->nullable()->constrained('basic_scan_claims', 'id', 'basic_otp_claim_fk')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('basic_otp_challenges', function (Blueprint $table) {
            $table->dropForeign('basic_otp_claim_fk');
            $table->dropColumn('scan_claim_id');
        });
        Schema::dropIfExists('basic_scan_claims');
    }
};

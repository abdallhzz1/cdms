<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('clinical_university_sessions', function (Blueprint $table): void {
            $table->uuid('qr_public_id')->nullable()->unique('cu_sessions_qr_public_unique');
            $table->string('qr_state', 16)->nullable();
            $table->timestamp('qr_opened_at')->nullable();
            $table->timestamp('qr_closed_at')->nullable();
        });
        Schema::table('clinical_university_attendance_records', function (Blueprint $table): void {
            $table->string('status', 16)->nullable()->change();
        });
    }

    public function down(): void
    {
        // Refuse rollback while a QR register is still open; never invent absence marks.
        if (DB::table('clinical_university_attendance_records')->whereNull('status')->exists()) {
            throw new \RuntimeException('Close every university lecture QR register before rolling back this migration.');
        }
        Schema::table('clinical_university_attendance_records', function (Blueprint $table): void {
            $table->string('status', 16)->nullable(false)->change();
        });
        Schema::table('clinical_university_sessions', function (Blueprint $table): void {
            $table->dropUnique('cu_sessions_qr_public_unique');
            $table->dropColumn(['qr_public_id', 'qr_state', 'qr_opened_at', 'qr_closed_at']);
        });
    }
};

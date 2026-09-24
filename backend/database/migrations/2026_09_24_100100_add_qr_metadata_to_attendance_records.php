<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_records', function (Blueprint $table) {
            $table->unsignedBigInteger('clinical_qr_attendance_roster_id')->nullable()->after('student_id');
            $table->timestamp('check_in_at')->nullable()->after('excuse_note');
            $table->timestamp('check_out_at')->nullable()->after('check_in_at');
            $table->string('recording_source', 24)->nullable()->after('check_out_at');
            $table->boolean('is_incomplete')->default(false)->after('recording_source');
            $table->foreign('clinical_qr_attendance_roster_id', 'attendance_qr_roster_fk')->references('id')->on('clinical_qr_attendance_roster')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('attendance_records', function (Blueprint $table) {
            $table->dropForeign('attendance_qr_roster_fk');
            $table->dropColumn(['check_in_at', 'check_out_at', 'recording_source', 'is_incomplete']);
        });
    }
};

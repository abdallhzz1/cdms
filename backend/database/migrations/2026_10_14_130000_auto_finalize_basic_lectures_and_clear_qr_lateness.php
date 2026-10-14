<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasColumn('basic_lecture_sessions', 'auto_finalize_at')) {
            Schema::table('basic_lecture_sessions', function (Blueprint $table): void {
                $table->timestamp('auto_finalize_at')->nullable()->index('basic_lecture_auto_finalize_idx');
            });
        }

        // Automatic lateness was never a lecturer decision. Preserve every
        // attendance status, timestamp and manual correction in old registers.
        $count = DB::table('basic_lecture_records')->where('source', 'qr')->where('is_late', true)
            ->update(['is_late' => false, 'updated_at' => now()]);
        if ($count > 0) {
            DB::table('basic_attendance_audits')->insert([
                'session_id' => null, 'user_id' => null, 'event' => 'policy.qr_lateness_cleared',
                'details' => json_encode(['records_changed' => $count], JSON_UNESCAPED_UNICODE),
                'created_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        // Old QR late flags cannot be inferred again; do not recreate them.
        if (Schema::hasColumn('basic_lecture_sessions', 'auto_finalize_at')) {
            Schema::table('basic_lecture_sessions', fn (Blueprint $table) => $table->dropColumn('auto_finalize_at'));
        }
    }
};

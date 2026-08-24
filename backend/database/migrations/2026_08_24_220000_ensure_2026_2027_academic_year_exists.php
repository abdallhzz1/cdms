<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Automated tests create their own year fixtures; this is production
        // bootstrap data for installations that ran migrations without seeds.
        if (app()->environment('testing') || ! Schema::hasTable('academic_years')) {
            return;
        }

        $hasCurrentYear = DB::table('academic_years')->where('is_current', true)->exists();
        $yearExists = DB::table('academic_years')->where('code', '2026/2027')->exists();

        if (! $yearExists) {
            DB::table('academic_years')->insert([
                'code' => '2026/2027',
                'start_date' => '2026-09-01',
                'end_date' => '2027-08-31',
                'semester1_start' => '2026-09-01',
                'semester1_end' => '2027-01-15',
                'semester2_start' => '2027-02-01',
                'semester2_end' => '2027-06-15',
                'summer_start' => null,
                'summer_end' => null,
                'is_current' => ! $hasCurrentYear,
                'status' => 'active',
                'notes' => 'System academic year for student group registration.',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return;
        }

        if (! $hasCurrentYear) {
            DB::table('academic_years')
                ->where('code', '2026/2027')
                ->update(['is_current' => true, 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        // Keep operational academic-year records on rollback.
    }
};

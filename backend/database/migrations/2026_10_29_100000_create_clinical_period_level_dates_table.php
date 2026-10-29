<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('clinical_period_level_dates')) {
            return;
        }

        Schema::create('clinical_period_level_dates', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('clinical_period_id');
            $table->string('academic_level', 20);
            $table->date('start_date');
            $table->date('end_date');
            $table->unsignedTinyInteger('weeks_count');
            $table->timestamps();
            $table->foreign('clinical_period_id', 'cp_level_date_period_fk')
                ->references('id')->on('clinical_periods')->cascadeOnDelete();
            $table->unique(['clinical_period_id', 'academic_level'], 'cp_level_date_unique');
            $table->index(['academic_level', 'start_date', 'end_date'], 'cp_level_date_lookup');
        });

        // Compatibility-only backfill: copy each existing period to all three
        // levels. Existing rotations, distributions and their dates are not
        // updated or republished by this migration.
        $now = now();
        DB::table('clinical_periods')->orderBy('id')->chunkById(100, function ($periods) use ($now) {
            $rows = [];
            foreach ($periods as $period) {
                foreach (['fourth', 'fifth', 'sixth'] as $level) {
                    $rows[] = [
                        'clinical_period_id' => $period->id,
                        'academic_level' => $level,
                        'start_date' => $period->start_date,
                        'end_date' => $period->end_date,
                        'weeks_count' => $period->weeks_count,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }
            }
            if ($rows) {
                DB::table('clinical_period_level_dates')->insert($rows);
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinical_period_level_dates');
    }
};

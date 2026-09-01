<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('course_schedule_cells', function (Blueprint $table) {
            $table->foreignId('training_site_id')->nullable()->after('course_schedule_row_id')->constrained('training_sites')->nullOnDelete();
        });
        DB::table('course_schedule_cells')->whereNull('training_site_id')->orderBy('id')->chunkById(500, function ($cells) {
            $sites = DB::table('course_schedule_rows')->whereIn('id', $cells->pluck('course_schedule_row_id'))->pluck('training_site_id', 'id');
            foreach ($cells as $cell) {
                DB::table('course_schedule_cells')->where('id', $cell->id)->update(['training_site_id' => $sites[$cell->course_schedule_row_id] ?? null]);
            }
        });
    }

    public function down(): void
    {
        Schema::table('course_schedule_cells', function (Blueprint $table) {
            $table->dropConstrainedForeignId('training_site_id');
        });
    }
};

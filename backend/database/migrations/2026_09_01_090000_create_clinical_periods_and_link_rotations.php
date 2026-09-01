<?php

use Carbon\Carbon;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinical_periods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->string('code', 20);
            $table->string('name_ar');
            $table->string('name_en')->nullable();
            $table->unsignedTinyInteger('sequence');
            $table->date('start_date');
            $table->date('end_date');
            $table->unsignedTinyInteger('weeks_count')->default(12);
            $table->enum('status', ['planned', 'active', 'closed'])->default('planned');
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->unique(['academic_year_id', 'code']);
            $table->unique(['academic_year_id', 'sequence']);
        });

        Schema::table('rotations', function (Blueprint $table) {
            $table->dropUnique('rotation_year_course_unique');
            $table->foreignId('clinical_period_id')->nullable()->after('course_id')
                ->constrained('clinical_periods')->restrictOnDelete();
            $table->enum('schedule_scope', ['period', 'annual'])->default('annual')->after('clinical_period_id');
            $table->unique(['academic_year_id', 'course_id', 'clinical_period_id'], 'rotation_year_course_period_unique');
        });

        $now = now();
        foreach (DB::table('academic_years')->orderBy('id')->get() as $year) {
            $yearStart = Carbon::parse($year->start_date);
            $yearEnd = Carbon::parse($year->end_date);
            $periodIds = [];
            foreach ([1, 2, 3] as $sequence) {
                $start = $yearStart->copy()->addWeeks(($sequence - 1) * 12);
                if ($start->gt($yearEnd)) break;
                $end = $start->copy()->addWeeks(12)->subDay();
                if ($end->gt($yearEnd)) {
                    $end = $yearEnd->copy();
                }
                $periodIds[$sequence] = DB::table('clinical_periods')->insertGetId([
                    'academic_year_id' => $year->id,
                    'code' => 'P'.$sequence,
                    'name_ar' => 'الفترة السريرية '.$sequence,
                    'name_en' => 'Clinical Period '.$sequence,
                    'sequence' => $sequence,
                    'start_date' => $start->toDateString(),
                    'end_date' => $end->toDateString(),
                    'weeks_count' => 12,
                    'status' => $year->is_current ? 'active' : 'planned',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            foreach (DB::table('rotations')->where('academic_year_id', $year->id)->get() as $rotation) {
                $periodId = null;
                if ((int) ($rotation->duration_weeks ?? 0) <= 12 && $rotation->start_date) {
                    $periodId = DB::table('clinical_periods')
                        ->where('academic_year_id', $year->id)
                        ->whereDate('start_date', '<=', $rotation->start_date)
                        ->whereDate('end_date', '>=', $rotation->start_date)
                        ->value('id');
                }
                DB::table('rotations')->where('id', $rotation->id)->update([
                    'clinical_period_id' => $periodId,
                    'schedule_scope' => $periodId ? 'period' : 'annual',
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('rotations', function (Blueprint $table) {
            $table->dropUnique('rotation_year_course_period_unique');
            $table->dropConstrainedForeignId('clinical_period_id');
            $table->dropColumn('schedule_scope');
            $table->unique(['academic_year_id', 'course_id'], 'rotation_year_course_unique');
        });
        Schema::dropIfExists('clinical_periods');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('group_registration_cycles', function (Blueprint $table) {
            $table->json('main_group_codes')->nullable()->after('default_capacity');
        });

        $defaults = [
            'fourth' => ['L', 'M', 'N'],
            'fifth' => ['A', 'B', 'C'],
            'sixth' => ['Q', 'R', 'S'],
        ];

        DB::table('group_registration_cycles')->orderBy('id')->get()->each(function ($cycle) use ($defaults) {
            $codes = DB::table('student_groups')
                ->where('academic_year_id', $cycle->academic_year_id)
                ->where('academic_level', $cycle->academic_level)
                ->where('group_type', 'self_registration')
                ->orderBy('name')
                ->pluck('name')
                ->map(fn ($code) => strtoupper(trim((string) $code)))
                ->filter()
                ->values()
                ->all();

            DB::table('group_registration_cycles')->where('id', $cycle->id)->update([
                'main_group_codes' => json_encode($codes ?: ($defaults[$cycle->academic_level] ?? [])),
            ]);
        });
    }

    public function down(): void
    {
        Schema::table('group_registration_cycles', function (Blueprint $table) {
            $table->dropColumn('main_group_codes');
        });
    }
};

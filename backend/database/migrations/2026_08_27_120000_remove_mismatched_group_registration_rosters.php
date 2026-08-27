<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $mismatched = DB::table('student_group_rosters')
            ->join('group_registration_cycles', 'group_registration_cycles.id', '=', 'student_group_rosters.group_registration_cycle_id')
            ->join('students', 'students.id', '=', 'student_group_rosters.student_id')
            ->whereColumn('students.academic_level', '!=', 'group_registration_cycles.academic_level')
            ->get([
                'student_group_rosters.id',
                'student_group_rosters.student_id',
                'group_registration_cycles.academic_year_id',
            ]);

        foreach ($mismatched->groupBy('student_id') as $studentId => $rosters) {
            DB::table('student_group_assignments')
                ->where('student_id', $studentId)
                ->whereIn('academic_year_id', $rosters->pluck('academic_year_id')->unique())
                ->delete();
        }

        DB::table('student_group_rosters')->whereIn('id', $mismatched->pluck('id'))->delete();
    }

    public function down(): void
    {
        // Removed mismatched operational links cannot be reconstructed safely.
    }
};

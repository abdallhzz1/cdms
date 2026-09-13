<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('course_assessment_components', function (Blueprint $table) {
            $table->string('code', 32)->nullable()->after('course_id');
        });

        DB::transaction(function (): void {
            DB::table('course_assessment_components')->delete();
            $now = now();
            $rows = [];
            foreach (DB::table('courses')->pluck('id') as $courseId) {
                foreach ($this->standardComponents() as $component) {
                    $rows[] = ['course_id' => $courseId, ...$component, 'created_at' => $now, 'updated_at' => $now];
                }
            }
            foreach (array_chunk($rows, 500) as $chunk) {
                DB::table('course_assessment_components')->insert($chunk);
            }
        });

        Schema::table('course_assessment_components', function (Blueprint $table) {
            $table->unique(['course_id', 'code'], 'course_assessment_component_code_unique');
        });
    }

    public function down(): void
    {
        Schema::table('course_assessment_components', function (Blueprint $table) {
            $table->dropUnique('course_assessment_component_code_unique');
            $table->dropColumn('code');
        });
    }

    private function standardComponents(): array
    {
        return [
            ['code' => 'clinical', 'name' => 'التقييم السريري', 'weight' => 20, 'max_score' => 20, 'evaluator' => 'clinical_supervisor', 'timing' => 'continuous', 'is_required_to_pass' => true],
            ['code' => 'osce', 'name' => 'امتحان OSCE', 'weight' => 40, 'max_score' => 40, 'evaluator' => 'department', 'timing' => 'final', 'is_required_to_pass' => false],
            ['code' => 'written', 'name' => 'الامتحان النظري', 'weight' => 40, 'max_score' => 40, 'evaluator' => 'department', 'timing' => 'final', 'is_required_to_pass' => false],
        ];
    }
};

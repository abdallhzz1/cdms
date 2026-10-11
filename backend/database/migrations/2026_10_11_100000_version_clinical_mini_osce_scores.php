<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clinical_mini_osce_scores', function (Blueprint $table) {
            $table->foreignId('distribution_version_id')->nullable()->after('rotation_block_id')
                ->constrained('distribution_versions')->restrictOnDelete();
        });

        // A block can be reused by a published revision. Keep the earlier
        // score as an audit record instead of overwriting it on re-entry.
        Schema::table('clinical_mini_osce_scores', function (Blueprint $table) {
            $table->index('rotation_block_id', 'mini_osce_block_idx');
            $table->unique(['student_id', 'rotation_block_id', 'distribution_version_id', 'entered_by_person_id'], 'mini_osce_version_uq');
        });
        Schema::table('clinical_mini_osce_scores', fn (Blueprint $table) => $table->dropUnique('mini_osce_student_block_uq'));

        // Older scores have no version. Attribute one only when the student,
        // block and entering supervisor identify exactly one published version.
        // Ambiguous records remain untouched and cannot become official by guesswork.
        DB::table('clinical_mini_osce_scores')->orderBy('id')->chunkById(100, function ($scores): void {
            foreach ($scores as $score) {
                $versions = DB::table('student_clinical_assignments as assignments')
                    ->join('distribution_versions as versions', 'versions.id', '=', 'assignments.distribution_version_id')
                    ->where('assignments.student_id', $score->student_id)
                    ->where('assignments.rotation_block_id', $score->rotation_block_id)
                    ->where('assignments.supervisor_id', $score->entered_by_person_id)
                    ->where('versions.status', 'published')
                    ->distinct()->pluck('assignments.distribution_version_id');
                if ($versions->count() === 1) {
                    DB::table('clinical_mini_osce_scores')->where('id', $score->id)
                        ->update(['distribution_version_id' => $versions->first()]);
                }
            }
        });
    }

    public function down(): void
    {
        $duplicates = DB::table('clinical_mini_osce_scores')
            ->select('student_id', 'rotation_block_id')
            ->groupBy('student_id', 'rotation_block_id')
            ->havingRaw('COUNT(*) > 1')->exists();
        if ($duplicates) {
            throw new RuntimeException('Cannot remove mini-OSCE versioning while multiple versions contain scores for one student and block.');
        }

        Schema::table('clinical_mini_osce_scores', function (Blueprint $table) {
            $table->dropUnique('mini_osce_version_uq');
            $table->unique(['student_id', 'rotation_block_id'], 'mini_osce_student_block_uq');
            $table->dropIndex('mini_osce_block_idx');
            $table->dropConstrainedForeignId('distribution_version_id');
        });
    }
};

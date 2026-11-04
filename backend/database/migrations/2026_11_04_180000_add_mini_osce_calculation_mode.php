<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('course_assessment_components', function (Blueprint $table) {
            // Preserve historical calculations until an authorized plan change.
            $table->string('mini_osce_mode', 24)->default('legacy');
        });
        Schema::table('grade_entries', fn (Blueprint $table) => $table->decimal('mini_osce_score', 8, 2)->nullable());
    }

    public function down(): void
    {
        Schema::table('grade_entries', fn (Blueprint $table) => $table->dropColumn('mini_osce_score'));
        Schema::table('course_assessment_components', fn (Blueprint $table) => $table->dropColumn('mini_osce_mode'));
    }
};

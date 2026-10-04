<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('course_assessment_components', function (Blueprint $table) {
            $table->decimal('entry_max_score', 8, 2)->nullable()->after('max_score');
        });
    }

    public function down(): void
    {
        Schema::table('course_assessment_components', function (Blueprint $table) {
            $table->dropColumn('entry_max_score');
        });
    }
};

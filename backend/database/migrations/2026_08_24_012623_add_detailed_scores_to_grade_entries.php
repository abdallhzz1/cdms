<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('grade_entries', function (Blueprint $table) {
            $table->decimal('clinical_score', 5, 2)->nullable()->after('score');
            $table->decimal('osce_score', 5, 2)->nullable()->after('clinical_score');
            $table->decimal('written_score', 5, 2)->nullable()->after('osce_score');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('grade_entries', function (Blueprint $table) {
            $table->dropColumn(['clinical_score', 'osce_score', 'written_score']);
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('quality_survey_responses', function (Blueprint $table) {
            $table->uuid('submission_id')->nullable()->after('id')->index();
        });
    }

    public function down(): void
    {
        Schema::table('quality_survey_responses', fn (Blueprint $table) => $table->dropColumn('submission_id'));
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clinical_assessments', function (Blueprint $table) {
            $table->uuid('assessment_batch_uuid')->nullable()->after('evaluator_person_id')->index();
        });
    }

    public function down(): void
    {
        Schema::table('clinical_assessments', function (Blueprint $table) {
            $table->dropColumn('assessment_batch_uuid');
        });
    }
};

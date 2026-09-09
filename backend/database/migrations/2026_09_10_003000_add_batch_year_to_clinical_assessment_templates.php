<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('clinical_assessment_templates', 'batch_year')) {
            Schema::table('clinical_assessment_templates', function (Blueprint $table) {
                $table->unsignedSmallInteger('batch_year')->nullable()->after('course_id');
            });
        }
        Schema::table('clinical_assessment_templates', function (Blueprint $table) {
            // Keep cat_scope_active_idx: MySQL also uses it to support the course_id foreign key.
            $table->index(['course_id', 'batch_year', 'is_active'], 'cat_batch_scope_idx');
        });
    }

    public function down(): void
    {
        Schema::table('clinical_assessment_templates', function (Blueprint $table) {
            $table->dropIndex('cat_batch_scope_idx');
            $table->dropColumn('batch_year');
        });
    }
};

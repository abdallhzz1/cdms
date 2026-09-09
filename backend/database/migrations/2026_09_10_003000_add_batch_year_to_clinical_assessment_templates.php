<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clinical_assessment_templates', function (Blueprint $table) {
            $table->unsignedSmallInteger('batch_year')->nullable()->after('course_id');
        });
        Schema::table('clinical_assessment_templates', function (Blueprint $table) {
            $table->dropIndex('cat_scope_active_idx');
            $table->index(['course_id', 'batch_year', 'is_active'], 'cat_scope_active_idx');
        });
    }

    public function down(): void
    {
        Schema::table('clinical_assessment_templates', function (Blueprint $table) {
            $table->dropIndex('cat_scope_active_idx');
            $table->dropColumn('batch_year');
        });
        Schema::table('clinical_assessment_templates', function (Blueprint $table) {
            $table->index(['course_id', 'is_active'], 'cat_scope_active_idx');
        });
    }
};

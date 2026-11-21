<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('student_group_assignments', function (Blueprint $table) {
            $table->unsignedBigInteger('effective_from_clinical_period_id')->nullable()->after('valid_until');
            $table->unsignedBigInteger('effective_until_clinical_period_id')->nullable()->after('effective_from_clinical_period_id');

            $table->foreign('effective_from_clinical_period_id', 'sga_from_period_fk')
                ->references('id')->on('clinical_periods')->restrictOnDelete();
            $table->foreign('effective_until_clinical_period_id', 'sga_until_period_fk')
                ->references('id')->on('clinical_periods')->restrictOnDelete();
            $table->index(['student_id', 'academic_year_id', 'effective_from_clinical_period_id'], 'sga_student_year_period_idx');
        });
    }

    public function down(): void
    {
        Schema::table('student_group_assignments', function (Blueprint $table) {
            $table->dropForeign('sga_from_period_fk');
            $table->dropForeign('sga_until_period_fk');
            $table->dropIndex('sga_student_year_period_idx');
            $table->dropColumn(['effective_from_clinical_period_id', 'effective_until_clinical_period_id']);
        });
    }
};

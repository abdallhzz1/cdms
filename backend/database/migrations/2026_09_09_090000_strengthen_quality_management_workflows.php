<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('quality_kpis', function (Blueprint $table) {
            $table->string('value_type', 30)->default('percentage')->after('target_value');
            $table->decimal('target_numeric', 12, 2)->nullable()->after('value_type');
            $table->string('comparison_operator', 20)->default('gte')->after('target_numeric');
            $table->decimal('warning_numeric', 12, 2)->nullable()->after('comparison_operator');
            $table->boolean('is_active')->default(true)->after('responsible');
        });

        Schema::table('quality_kpi_measurements', function (Blueprint $table) {
            $table->string('review_status', 30)->default('draft')->after('achievement_status');
            $table->foreignId('reviewed_by')->nullable()->after('recorded_by')->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable()->after('reviewed_by');
            $table->text('review_notes')->nullable()->after('reviewed_at');
        });

        Schema::table('quality_improvement_plans', function (Blueprint $table) {
            $table->foreignId('owner_user_id')->nullable()->after('responsible')->constrained('users')->nullOnDelete();
            $table->foreignId('quality_kpi_id')->nullable()->after('reference')->constrained('quality_kpis')->nullOnDelete();
            $table->foreignId('quality_survey_id')->nullable()->after('quality_kpi_id')->constrained('quality_surveys')->nullOnDelete();
            $table->text('root_cause')->nullable()->after('observation');
            $table->text('desired_outcome')->nullable()->after('improvement_action');
            $table->unsignedTinyInteger('progress_percent')->default(0)->after('priority');
            $table->foreignId('created_by')->nullable()->after('data_source')->constrained('users')->nullOnDelete();
            $table->foreignId('verified_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            $table->timestamp('verified_at')->nullable()->after('verified_by');
        });

        Schema::table('quality_surveys', function (Blueprint $table) {
            $table->uuid('public_id')->nullable()->unique()->after('id');
            $table->string('academic_year', 100)->nullable()->after('target_group');
            $table->date('opens_at')->nullable()->after('frequency');
            $table->date('closes_at')->nullable()->after('opens_at');
            $table->unsignedInteger('expected_responses')->nullable()->after('closes_at');
            $table->boolean('is_anonymous')->default(true)->after('is_mandatory');
            $table->string('status', 30)->default('draft')->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('quality_surveys', fn (Blueprint $table) => $table->dropColumn(['public_id', 'academic_year', 'opens_at', 'closes_at', 'expected_responses', 'is_anonymous', 'status']));
        Schema::table('quality_improvement_plans', function (Blueprint $table) {
            $table->dropConstrainedForeignId('owner_user_id');
            $table->dropConstrainedForeignId('quality_kpi_id');
            $table->dropConstrainedForeignId('quality_survey_id');
            $table->dropConstrainedForeignId('created_by');
            $table->dropConstrainedForeignId('verified_by');
            $table->dropColumn(['root_cause', 'desired_outcome', 'progress_percent', 'verified_at']);
        });
        Schema::table('quality_kpi_measurements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reviewed_by');
            $table->dropColumn(['review_status', 'reviewed_at', 'review_notes']);
        });
        Schema::table('quality_kpis', fn (Blueprint $table) => $table->dropColumn(['value_type', 'target_numeric', 'comparison_operator', 'warning_numeric', 'is_active']));
    }
};

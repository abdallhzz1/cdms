<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('quality_kpi_measurements')) return;

        Schema::create('quality_kpi_measurements', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('quality_kpi_id');
            $table->string('academic_year')->nullable();
            $table->date('measured_at');
            $table->decimal('numeric_value', 12, 2)->nullable();
            $table->string('display_value')->nullable();
            $table->string('achievement_status')->default('not_assessed');
            $table->text('evidence')->nullable();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('recorded_by')->nullable();
            $table->timestamps();

            $table->foreign('quality_kpi_id', 'qkm_kpi_fk')->references('id')->on('quality_kpis')->cascadeOnDelete();
            $table->foreign('recorded_by', 'qkm_user_fk')->references('id')->on('users')->nullOnDelete();
            $table->index(['quality_kpi_id', 'measured_at'], 'qkm_kpi_date_idx');
            $table->index(['achievement_status', 'measured_at'], 'qkm_status_date_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('quality_kpi_measurements');
    }
};

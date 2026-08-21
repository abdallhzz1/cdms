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
        Schema::create('department_head_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('department_id')->nullable()->constrained('departments')->onDelete('set null');
            $table->string('academic_title')->default('أستاذ مشارك — استشاري سريري');
            $table->string('specialty')->nullable();
            $table->string('contract_type')->default('عقد دائم — متفرغ');
            $table->string('appointment_date')->default('2024-09-01');
            $table->string('phone')->nullable();
            $table->longText('avatar_url')->nullable();
            $table->text('cv_summary')->nullable();
            $table->json('publications')->nullable();
            $table->json('conferences')->nullable();
            $table->json('kpi_weights')->nullable();
            $table->json('kpi_overrides')->nullable();
            $table->json('evaluation')->nullable();
            $table->timestamps();

            $table->unique('user_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('department_head_profiles');
    }
};

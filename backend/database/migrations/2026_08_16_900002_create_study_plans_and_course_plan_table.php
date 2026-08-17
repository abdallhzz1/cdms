<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('study_plans', function (Blueprint $table) {
            $table->id(); $table->string('code')->unique(); $table->string('name_ar'); $table->string('name_en')->nullable(); $table->boolean('is_active')->default(true); $table->timestamps();
        });
        Schema::create('course_study_plan', function (Blueprint $table) {
            $table->id(); $table->foreignId('study_plan_id')->constrained()->cascadeOnDelete(); $table->foreignId('course_id')->constrained()->restrictOnDelete(); $table->string('academic_level')->nullable(); $table->unsignedSmallInteger('sequence')->default(1); $table->boolean('is_required')->default(true); $table->timestamps(); $table->unique(['study_plan_id','course_id']);
        });
    }
    public function down(): void { Schema::dropIfExists('course_study_plan'); Schema::dropIfExists('study_plans'); }
};

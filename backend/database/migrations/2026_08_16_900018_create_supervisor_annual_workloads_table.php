<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('supervisor_annual_workloads', function (Blueprint $table) {
            $table->id();
            $table->string('academic_year');
            $table->string('academic_level')->nullable();
            $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('person_id')->nullable()->constrained('people')->nullOnDelete();
            $table->string('supervisor_name');
            $table->string('supervisor_code')->nullable();
            $table->unsignedSmallInteger('supervision_weeks')->nullable();
            $table->text('notes')->nullable();
            $table->string('data_source')->nullable();
            $table->timestamps();
            $table->unique(['academic_year', 'academic_level', 'supervisor_code', 'department_id'], 'annual_workload_unique');
        });
    }
    public function down(): void { Schema::dropIfExists('supervisor_annual_workloads'); }
};

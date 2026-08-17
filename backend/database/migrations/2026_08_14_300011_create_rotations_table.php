<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rotations', function (Blueprint $table) {
            $table->id();
            
            $table->foreignId('academic_year_id')
                  ->constrained('academic_years')->cascadeOnDelete();
                  
            $table->string('code')->index();
            $table->string('name');
            $table->enum('academic_level', ['fourth', 'fifth', 'sixth'])->index();
            $table->unsignedInteger('duration_weeks')->nullable();
            
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            
            $table->enum('status', ['draft', 'active', 'archived'])->default('draft')->index();
            
            $table->timestamps();
            
            // A rotation code must be unique within an academic year
            $table->unique(['academic_year_id', 'code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rotations');
    }
};

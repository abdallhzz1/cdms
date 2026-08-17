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
        Schema::create('distribution_conflicts', function (Blueprint $table) {
            $table->id();
            
            $table->foreignId('distribution_version_id')
                  ->constrained('distribution_versions')->cascadeOnDelete();
                  
            $table->foreignId('student_subgroup_id')
                  ->nullable()
                  ->constrained('student_subgroups')->cascadeOnDelete();
                  
            $table->foreignId('student_id')
                  ->nullable()
                  ->constrained('students')->cascadeOnDelete();
                  
            $table->foreignId('rotation_block_id')
                  ->nullable()
                  ->constrained('rotation_blocks')->cascadeOnDelete();
                  
            $table->foreignId('training_site_id')
                  ->nullable()
                  ->constrained('training_sites')->cascadeOnDelete();
                  
            $table->string('rule_code');
            $table->text('description')->nullable();
            
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('distribution_conflicts');
    }
};

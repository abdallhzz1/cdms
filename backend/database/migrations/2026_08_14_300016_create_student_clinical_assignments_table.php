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
        Schema::create('student_clinical_assignments', function (Blueprint $table) {
            $table->id();
            
            $table->foreignId('distribution_version_id')
                  ->constrained('distribution_versions')->cascadeOnDelete();
                  
            $table->foreignId('student_id')
                  ->constrained('students')->cascadeOnDelete();
                  
            $table->foreignId('student_subgroup_id')
                  ->nullable()
                  ->constrained('student_subgroups')->nullOnDelete();
                  
            $table->foreignId('rotation_block_id')
                  ->constrained('rotation_blocks')->cascadeOnDelete();
                  
            $table->foreignId('training_site_id')
                  ->constrained('training_sites')->restrictOnDelete();
                  
            $table->foreignId('department_id')
                  ->nullable()
                  ->constrained('departments')->nullOnDelete();
                  
            $table->foreignId('supervisor_id')
                  ->nullable()
                  ->constrained('people')->nullOnDelete();
                  
            $table->timestamps();
            
            // Unique constraint to prevent duplicate assignment for same student, same block, same version
            $table->unique(
                ['student_id', 'rotation_block_id', 'distribution_version_id'],
                'uniq_student_block_version'
            );
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('student_clinical_assignments');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rotation_blocks', function (Blueprint $table) {
            $table->id();
            
            $table->foreignId('rotation_id')
                  ->constrained('rotations')->cascadeOnDelete();
                  
            $table->string('block_code')->index();
            $table->unsignedInteger('from_week');
            $table->unsignedInteger('to_week');
            
            // Explicit link to the department providing this block
            $table->foreignId('department_id')
                  ->nullable()
                  ->constrained('departments')->restrictOnDelete();
                  
            $table->timestamps();
            
            // Block code should be unique within a rotation
            $table->unique(['rotation_id', 'block_code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rotation_blocks');
    }
};

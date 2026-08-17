<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_capacity_rules', function (Blueprint $table) {
            $table->id();
            
            $table->foreignId('site_id')
                  ->constrained('training_sites')->restrictOnDelete();
                  
            $table->foreignId('rotation_id')
                  ->constrained('rotations')->cascadeOnDelete();
                  
            $table->unsignedInteger('max_students')->nullable();
            $table->text('notes')->nullable();
            
            $table->timestamps();
            
            $table->unique(['site_id', 'rotation_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_capacity_rules');
    }
};

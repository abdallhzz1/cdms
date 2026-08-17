<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('distribution_versions', function (Blueprint $table) {
            $table->id();
            
            $table->foreignId('rotation_id')
                  ->constrained('rotations')->cascadeOnDelete();
                  
            $table->string('name')->nullable();
            $table->enum('status', ['draft', 'suggested', 'manual', 'published'])->default('draft')->index();
            
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('distribution_versions');
    }
};

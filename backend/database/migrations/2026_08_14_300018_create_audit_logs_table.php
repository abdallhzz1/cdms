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
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            
            $table->foreignId('user_id')
                  ->nullable()
                  ->constrained('users')->nullOnDelete();
                  
            $table->string('action')->index();
            $table->string('entity_type')->index();
            $table->unsignedBigInteger('entity_id')->index();
            
            // Optional links for easier querying in the distribution context
            $table->foreignId('distribution_version_id')
                  ->nullable()
                  ->constrained('distribution_versions')->cascadeOnDelete();
                  
            $table->foreignId('student_id')
                  ->nullable()
                  ->constrained('students')->nullOnDelete();
                  
            $table->json('changes')->nullable();
            
            // Override information
            $table->boolean('is_override')->default(false);
            $table->text('override_reason')->nullable();
            
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};

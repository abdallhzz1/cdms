<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('course_schedule_block_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('distribution_version_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rotation_block_id')->constrained()->cascadeOnDelete();
            $table->string('activity_type', 30)->default('clinical');
            $table->string('activity_label')->nullable();
            $table->string('activity_scope', 30)->default('all');
            $table->json('main_group_codes')->nullable();
            $table->timestamps();
            $table->unique(['distribution_version_id', 'rotation_block_id'], 'schedule_block_activity_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('course_schedule_block_activities');
    }
};

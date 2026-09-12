<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('operational_task_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('operational_task_id')->constrained('operational_tasks')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->text('body');
            $table->timestamps();
            $table->index(['operational_task_id', 'created_at'], 'task_comments_task_date_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('operational_task_comments');
    }
};

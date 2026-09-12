<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('correspondence_templates');
    }

    public function down(): void
    {
        Schema::create('correspondence_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('subject', 500)->nullable();
            $table->text('body');
            $table->string('message_type', 24)->default('message');
            $table->string('priority', 24)->default('normal');
            $table->timestamps();
        });
    }
};

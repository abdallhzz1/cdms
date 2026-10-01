<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('basic_absence_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('section_id')->constrained('basic_sections')->restrictOnDelete();
            $table->foreignId('student_id')->constrained('basic_students')->restrictOnDelete();
            $table->unsignedTinyInteger('threshold');
            $table->unsignedSmallInteger('absence_count');
            $table->foreignId('sent_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('sent_at');
            $table->unique(['section_id', 'student_id', 'threshold'], 'basic_absence_notice_uq');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('basic_absence_notifications');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('advising_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained()->restrictOnDelete();
            $table->foreignId('advisor_person_id')->nullable()->constrained('people')->nullOnDelete();
            $table->date('meeting_date');
            $table->string('category')->default('general');
            $table->text('notes');
            $table->text('action_plan')->nullable();
            $table->string('status')->default('open');
            $table->timestamps();
        });
    }

    public function down(): void { Schema::dropIfExists('advising_records'); }
};

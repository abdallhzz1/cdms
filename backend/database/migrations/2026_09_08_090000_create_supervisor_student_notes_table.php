<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supervisor_student_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supervisor_person_id')->constrained('people')->cascadeOnDelete();
            $table->foreignId('student_id')->constrained('students')->restrictOnDelete();
            $table->foreignId('student_clinical_assignment_id')->nullable()->constrained('student_clinical_assignments')->nullOnDelete();
            $table->foreignId('rotation_block_id')->nullable()->constrained('rotation_blocks')->nullOnDelete();
            $table->foreignId('training_site_id')->nullable()->constrained('training_sites')->nullOnDelete();
            $table->date('note_date');
            $table->text('note');
            $table->timestamps();
            $table->index(['supervisor_person_id', 'student_id', 'note_date'], 'supervisor_student_note_lookup');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supervisor_student_notes');
    }
};

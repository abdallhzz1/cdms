<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('course_schedule_row_supervisors')) {
            return;
        }

        Schema::create('course_schedule_row_supervisors', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('course_schedule_row_id');
            $table->unsignedBigInteger('person_id');
            $table->json('weekdays');
            $table->timestamps();
            // Explicit short names keep the migration compatible with MySQL's
            // 64-character identifier limit on production hosting.
            $table->foreign('course_schedule_row_id', 'csr_supervisor_row_fk')
                ->references('id')->on('course_schedule_rows')->cascadeOnDelete();
            $table->foreign('person_id', 'csr_supervisor_person_fk')
                ->references('id')->on('people')->restrictOnDelete();
            $table->unique(['course_schedule_row_id', 'person_id'], 'csr_supervisor_unique');
            $table->index(['person_id', 'course_schedule_row_id'], 'csr_supervisor_lookup');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('course_schedule_row_supervisors');
    }
};

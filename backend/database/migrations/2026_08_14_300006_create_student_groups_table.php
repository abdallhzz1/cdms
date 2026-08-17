<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up() {
        Schema::create('student_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('academic_year_id')->constrained('academic_years')->cascadeOnDelete();
            $table->string('name');
            $table->string('distribution_manager')->nullable();
            $table->string('academic_level')->nullable();
            $table->integer('capacity')->nullable();
            $table->string('group_type')->nullable();
            $table->text('description')->nullable();
            $table->text('notes')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
            $table->unique(['academic_year_id', 'name', 'academic_level'], 'grp_year_name_level_unique');
        });
    }
    public function down() { Schema::dropIfExists('student_groups'); }
};
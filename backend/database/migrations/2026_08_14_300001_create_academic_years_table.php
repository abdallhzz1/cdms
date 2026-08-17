<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up() {
        Schema::create('academic_years', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->date('start_date');
            $table->date('end_date');
            $table->date('semester1_start')->nullable();
            $table->date('semester1_end')->nullable();
            $table->date('semester2_start')->nullable();
            $table->date('semester2_end')->nullable();
            $table->date('summer_start')->nullable();
            $table->date('summer_end')->nullable();
            $table->boolean('is_current')->default(false);
            $table->string('status')->default('active');
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }
    public function down() { Schema::dropIfExists('academic_years'); }
};

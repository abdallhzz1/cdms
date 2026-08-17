<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up() {
        Schema::create('department_rotation', function (Blueprint $table) {
            $table->id();
            $table->foreignId('department_id')->constrained('departments')->cascadeOnDelete();
            $table->foreignId('rotation_id')->constrained('rotations')->cascadeOnDelete();
            $table->unique(['department_id', 'rotation_id']);
        });
    }
    public function down() { Schema::dropIfExists('department_rotation'); }
};

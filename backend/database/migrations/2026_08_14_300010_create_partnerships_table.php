<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up() {
        Schema::create('partnerships', function (Blueprint $table) {
            $table->id();
            $table->string('institution_name');
            $table->string('purpose')->nullable();
            $table->string('scope')->default('local');
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->string('data_source')->nullable();
            $table->timestamps();
        });
    }
    public function down() { Schema::dropIfExists('partnerships'); }
};

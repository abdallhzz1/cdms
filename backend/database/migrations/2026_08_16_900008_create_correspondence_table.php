<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('correspondence', function (Blueprint $table) {
            $table->id(); $table->string('reference_number')->unique(); $table->string('direction');
            $table->string('subject'); $table->string('counterparty')->nullable(); $table->date('correspondence_date');
            $table->text('summary')->nullable(); $table->string('status')->default('draft'); $table->timestamp('submitted_at')->nullable(); $table->timestamp('closed_at')->nullable(); $table->timestamps();
        });
    }
    public function down(): void { Schema::dropIfExists('correspondence'); }
};

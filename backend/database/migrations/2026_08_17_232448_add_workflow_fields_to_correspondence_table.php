<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('correspondence', function (Blueprint $table) {
            $table->foreignId('sender_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->string('priority')->default('normal');
        });
    }

    public function down(): void
    {
        Schema::table('correspondence', function (Blueprint $table) {
            $table->dropForeign(['sender_id']);
            $table->dropForeign(['assigned_to']);
            $table->dropColumn(['sender_id', 'assigned_to', 'priority']);
        });
    }
};

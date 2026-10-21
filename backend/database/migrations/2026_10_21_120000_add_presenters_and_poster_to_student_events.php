<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('student_events', function (Blueprint $table) {
            $table->json('presenters')->nullable();
            $table->string('poster_storage_path')->nullable();
            $table->string('poster_mime_type', 50)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('student_events', function (Blueprint $table) {
            $table->dropColumn(['presenters', 'poster_storage_path', 'poster_mime_type']);
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('course_schedule_rows', fn (Blueprint $table) => $table->json('workplace_schedule')->nullable());
    }

    public function down(): void
    {
        Schema::table('course_schedule_rows', fn (Blueprint $table) => $table->dropColumn('workplace_schedule'));
    }
};

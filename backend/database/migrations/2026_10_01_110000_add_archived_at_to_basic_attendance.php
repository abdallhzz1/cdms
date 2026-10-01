<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        foreach (['basic_courses', 'basic_sections', 'basic_lecture_sessions'] as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->timestamp('archived_at')->nullable()->index();
            });
        }
        Schema::table('basic_lecture_sessions', function (Blueprint $table) {
            $table->foreignId('lecturer_id')->nullable()->constrained('users')->nullOnDelete();
        });
        (new \Database\Seeders\BasicAttendancePermissionSeeder)->run();
    }

    public function down(): void
    {
        Schema::table('basic_lecture_sessions', function (Blueprint $table) {
            $table->dropForeign(['lecturer_id']);
            $table->dropColumn('lecturer_id');
        });
        foreach (['basic_lecture_sessions', 'basic_sections', 'basic_courses'] as $name) {
            Schema::table($name, fn (Blueprint $table) => $table->dropColumn('archived_at'));
        }
    }
};

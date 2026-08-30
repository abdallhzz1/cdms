<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('courses') && Schema::hasColumn('courses', 'semester')) {
            DB::statement('ALTER TABLE courses MODIFY semester TINYINT UNSIGNED NULL');
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('courses') && Schema::hasColumn('courses', 'semester')) {
            DB::table('courses')->whereNull('semester')->update(['semester' => 1]);
            DB::statement('ALTER TABLE courses MODIFY semester TINYINT UNSIGNED NOT NULL DEFAULT 1');
        }
    }
};

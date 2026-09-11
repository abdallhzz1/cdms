<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;

return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('courses') && Schema::hasColumn('courses', 'semester')) {
            if (DB::connection()->getDriverName() === 'sqlite') {
                Schema::table('courses', fn (Blueprint $table) => $table->unsignedTinyInteger('semester')->nullable()->change());
            } else {
                DB::statement('ALTER TABLE courses MODIFY semester TINYINT UNSIGNED NULL');
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('courses') && Schema::hasColumn('courses', 'semester')) {
            DB::table('courses')->whereNull('semester')->update(['semester' => 1]);
            if (DB::connection()->getDriverName() === 'sqlite') {
                Schema::table('courses', fn (Blueprint $table) => $table->unsignedTinyInteger('semester')->default(1)->nullable(false)->change());
            } else {
                DB::statement('ALTER TABLE courses MODIFY semester TINYINT UNSIGNED NOT NULL DEFAULT 1');
            }
        }
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        if (Schema::hasTable('courses') && !Schema::hasColumn('courses', 'semester')) {
            Schema::table('courses', function (Blueprint $table) {
                $table->unsignedTinyInteger('semester')->default(1)->after('academic_level');
            });
        }
    }

    public function down(): void {
        if (Schema::hasTable('courses') && Schema::hasColumn('courses', 'semester')) {
            Schema::table('courses', function (Blueprint $table) {
                $table->dropColumn('semester');
            });
        }
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('department_head_profiles', function (Blueprint $table) {
            $table->string('avatar_storage_path')->nullable()->after('avatar_url');
        });
    }

    public function down(): void
    {
        Schema::table('department_head_profiles', function (Blueprint $table) {
            $table->dropColumn('avatar_storage_path');
        });
    }
};

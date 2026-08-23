<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add scope columns to user_roles if they don't already exist
        if (!Schema::hasColumn('user_roles', 'scope_type')) {
            Schema::table('user_roles', function (Blueprint $table) {
                $table->string('scope_type')->nullable()->after('role_id');
            });
        }

        if (!Schema::hasColumn('user_roles', 'scope_id')) {
            Schema::table('user_roles', function (Blueprint $table) {
                $table->unsignedBigInteger('scope_id')->nullable()->after('scope_type');
            });
        }
    }

    public function down(): void {}
};

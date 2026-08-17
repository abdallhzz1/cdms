<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('distribution_versions', function (Blueprint $table) {
            $table->boolean('is_current')->default(false)->after('status');
            $table->index(['rotation_id', 'is_current']);
        });
    }

    public function down(): void
    {
        Schema::table('distribution_versions', function (Blueprint $table) {
            $table->dropIndex(['rotation_id', 'is_current']);
            $table->dropColumn('is_current');
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Stores the academic cohort levels an RTA/Supervisor is assigned to grade.
            // e.g. ["fourth"], ["fourth","fifth"], null = no restriction (all levels)
            $table->json('assigned_levels')->nullable()->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('assigned_levels');
        });
    }
};

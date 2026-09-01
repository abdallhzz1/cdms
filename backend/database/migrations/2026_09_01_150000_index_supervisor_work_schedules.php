<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('supervisor_availabilities', function (Blueprint $table) {
            $table->index(['person_id', 'training_site_id', 'available_from', 'available_until'], 'supervisor_work_period_lookup');
            $table->index(['person_id', 'day', 'status'], 'supervisor_work_day_lookup');
        });
    }

    public function down(): void
    {
        Schema::table('supervisor_availabilities', function (Blueprint $table) {
            $table->dropIndex('supervisor_work_period_lookup');
            $table->dropIndex('supervisor_work_day_lookup');
        });
    }
};

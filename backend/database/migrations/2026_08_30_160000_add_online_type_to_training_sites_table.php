<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        DB::statement("ALTER TABLE `training_sites` MODIFY `site_type` ENUM('hospital_public', 'hospital_private', 'medical_center', 'clinic', 'lab', 'online', 'other') NOT NULL DEFAULT 'hospital_public'");
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        DB::table('training_sites')->where('site_type', 'online')->update(['site_type' => 'other']);
        DB::statement("ALTER TABLE `training_sites` MODIFY `site_type` ENUM('hospital_public', 'hospital_private', 'medical_center', 'clinic', 'lab', 'other') NOT NULL DEFAULT 'hospital_public'");
    }
};

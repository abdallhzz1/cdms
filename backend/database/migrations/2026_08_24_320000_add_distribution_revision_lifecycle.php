<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('distribution_versions', function (Blueprint $table) {
            $table->foreignId('source_version_id')->nullable()->after('rotation_id')
                ->constrained('distribution_versions')->nullOnDelete();
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE distribution_versions MODIFY status ENUM('draft','suggested','manual','published','withdrawn') NOT NULL DEFAULT 'draft'");
        }

        foreach ([
            ['distribution.revise', 'REVISE', 'permissions.distribution_revise.description'],
            ['distribution.unpublish', 'UNPUBLISH', 'permissions.distribution_unpublish.description'],
        ] as [$code, $action, $description]) {
            DB::table('permissions')->updateOrInsert(
                ['code' => $code],
                ['module' => 'Distribution', 'action' => $action, 'description_key' => $description, 'created_at' => now(), 'updated_at' => now()],
            );
        }
    }

    public function down(): void
    {
        Schema::table('distribution_versions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('source_version_id');
        });
    }
};

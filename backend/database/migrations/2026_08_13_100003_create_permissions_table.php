<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Permissions come verbatim from the approved Permission Matrix document
 * (Clinical_Department_Permission_Matrix_Workflows_v1.xlsx, `Permissions`
 * sheet — 53 rows) — see database/seeders/PermissionSeeder.php. `code` is
 * the stable "module.action" identifier used everywhere in code
 * (`students.view`, `grades.approve`, ...); `module`/`action` are kept as
 * plain descriptive columns for admin-UI grouping in a later phase.
 * `description_key` is a translation key, not literal text, for the same
 * reason as roles.name_key above.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('permissions', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('module');
            $table->string('action');
            $table->string('description_key')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('permissions');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Roles carry a stable internal `code` (e.g. "CLINICAL_DIRECTOR") used
 * throughout the codebase, plus translation KEYS (not literal Arabic/English
 * text) for display — Prompt 02 §7: "Do not hardcode Arabic/English role
 * labels in the database." The actual bilingual strings live in
 * frontend/src/i18n/locales/{en,ar}.ts under the `roles.<code>.*` keys.
 *
 * The 10 roles themselves (SYS_ADMIN, DEAN, VICE_DEAN, CLINICAL_DIRECTOR,
 * ADMIN_ASSISTANT, DEPARTMENT_HEAD, RTA, CLINICAL_SUPERVISOR,
 * ACADEMIC_ADVISOR, QUALITY) come verbatim from
 * Clinical_Department_Permission_Matrix_Workflows_v1.xlsx's `Roles` sheet —
 * see database/seeders/RoleSeeder.php.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name_key');
            $table->string('description_key')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('roles');
    }
};

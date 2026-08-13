<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Role <-> Permission grants, each carrying a `scope_type` — this is the
 * "Scope" of Role + Permission + Scope (PROJECT_RULES.md / Prompt 02 §8).
 *
 * Deliberate deviation from the ERD workbook's full `permission_scopes`
 * table: that table's columns (department_id, academic_year_id, staff_id,
 * ...) reference Departments/Academic Years/Staff tables that do not exist
 * yet in this phase. Prompt 02 §12 explicitly allows building "the minimal
 * extensible foundation that can answer 'does this user have this
 * permission within this scope'" instead of copying a schema that depends
 * on not-yet-built tables. `scope_type` is a plain string (not a MySQL
 * ENUM, which is awkward to extend) — recognized values today are
 * 'global' (always allowed) and a small set of placeholders
 * ('department', 'own', 'assigned') that business modules will give real
 * meaning to via App\Services\AuthorizationService::resolveScope() as each
 * module is built. See docs/DECISIONS.md ADR-019.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('role_permissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('role_id')->constrained('roles')->cascadeOnDelete();
            $table->foreignId('permission_id')->constrained('permissions')->cascadeOnDelete();
            $table->string('scope_type')->default('global');
            $table->timestamps();

            $table->unique(['role_id', 'permission_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('role_permissions');
    }
};

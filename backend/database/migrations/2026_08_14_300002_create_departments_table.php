<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Clinical departments — source: workbook sheet 14 (13_الأقسام).
 *
 * 7 departments identified in the workbook:
 *   DEP-IM  (Internal Medicine)              — primary
 *   DEP-GS  (General Surgery)               — primary
 *   DEP-PED (Pediatrics)                    — primary
 *   DEP-OBG (Obstetrics & Gynecology)       — primary
 *   DEP-SSS (Surgical Subspecialties)       — sub
 *   DEP-IMS (IM Subspecialties)             — sub
 *   DEP-FCM (Family & Community Medicine)   — sub
 *
 * dept_type distinguishes "primary" (full clinical departments with a
 * complete rotation block) from "sub" (specialty blocks nested inside
 * a primary department's rotation structure — exact relationship to be
 * defined in Phase 3B when rotations are implemented).
 *
 * serves_academic_levels is a JSON array of enum values (fourth/fifth/sixth)
 * stored directly here to match the workbook column "السنوات التي يخدمها".
 * It is read-oriented data for scheduling; it does NOT replace the student's
 * own academic_level.
 *
 * Department head / RTA relationships are stored in the separate
 * department_head_assignments table (Phase 3A §3) to support historicity.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('departments', function (Blueprint $table) {
            $table->id();

            // e.g. "DEP-IM" — stable identifier used in seeds and imports
            $table->string('code', 20)->unique()->index();

            $table->string('name_ar');        // Arabic name from workbook
            $table->string('name_en');        // English name from workbook

            // primary = full dept; sub = specialty sub-block
            $table->enum('dept_type', ['primary', 'sub'])->default('primary')->index();

            // JSON array e.g. ["fourth","sixth"] — nullable because some rows
            // in the workbook have this column blank or ambiguous
            $table->json('serves_academic_levels')->nullable();

            $table->boolean('is_active')->default(true)->index();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('departments');
    }
};

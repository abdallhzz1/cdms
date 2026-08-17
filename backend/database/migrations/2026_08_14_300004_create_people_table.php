<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * People (staff) — source: workbook sheet 9 (08_الطاقم_والمشرفون).
 *
 * A single, normalized staff table for ALL people who have a professional
 * role in the clinical department:
 *   - Clinical Supervisors (مشرف سريري)
 *   - Department Heads (رئيس قسم)
 *   - Research & Teaching Assistants / RTAs (مساعد البحث والتدريس)
 *   - Academic Advisors (مرشد أكاديمي)
 *
 * ARCHITECTURE RULE (PROJECT_RULES.md "enter once, reuse everywhere"):
 * A person who is both a clinical supervisor AND a department head gets
 * ONE row here. Their ROLES are expressed through:
 *   1. department_head_assignments (head/rta assignments over time)
 *   2. The Phase 2 users table FK (user_id) if they need system access
 *   3. The Phase 2 role system (CLINICAL_SUPERVISOR, DEPARTMENT_HEAD, etc.)
 *
 * user_id is nullable because not every staff member in the workbook has
 * (or needs) a system login today. The constraint is UNIQUE because one
 * User account maps to exactly one person profile.
 *
 * primary_site_id links to the staff member's primary training hospital
 * ("المستشفى الأساسي" in the workbook). RESTRICT on delete: we should not
 * silently lose the association when a site is deactivated.
 *
 * contract_type values observed: "غير متفرغ" (part-time), full-time inferred.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('people', function (Blueprint $table) {
            $table->id();

            // e.g. "DR-000" from workbook — nullable because heads/advisors
            // identified by name only may not yet have a code assigned
            $table->string('staff_code', 20)->unique()->nullable()->index();

            $table->string('full_name_ar');
            $table->string('full_name_en')->nullable();

            $table->string('email')->nullable();
            $table->string('phone')->nullable();

            // Primary department affiliation
            $table->foreignId('department_id')
                ->nullable()
                ->constrained('departments')->restrictOnDelete();

            // Primary hospital/clinic associated with this person
            $table->foreignId('primary_site_id')
                ->nullable()
                ->constrained('training_sites')->nullOnDelete();

            // Professional / academic
            $table->string('specialty')->nullable();
            $table->string('academic_degree')->nullable();
            $table->string('license_number')->nullable();

            $table->enum('contract_type', [
                'full_time', 'part_time', 'visiting', 'honorary',
            ])->nullable();
            $table->date('contract_start')->nullable();
            $table->date('contract_end')->nullable();

            $table->tinyInteger('teaching_hours_per_week')->unsigned()->nullable();
            $table->string('available_days')->nullable();   // e.g. "الأحد، الثلاثاء"
            $table->tinyInteger('max_students')->unsigned()->nullable();

            $table->string('photo_url')->nullable();
            $table->string('cv_url')->nullable();

            $table->boolean('is_active')->default(true)->index();

            // Link to system user account (nullable — not every person logs in)
            $table->foreignId('user_id')
                ->nullable()
                ->unique()          // 1-to-1 — one User → one Person profile
                ->constrained('users')->nullOnDelete();

            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('people');
    }
};

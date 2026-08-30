<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Training sites — source: workbook sheet 15 (14_مواقع_التدريب_وطاقتها).
 *
 * Created BEFORE people because people.primary_site_id references this table.
 * A site is a physical clinical training location — hospital, clinic, center,
 * lab, etc. This is NOT the same as a partnership (sheet 16), which is a
 * formal institutional agreement. Some sites have partnerships and some do not.
 *
 * Capacity columns (bed_count, max_students_per_period, max_students_per_doctor)
 * come directly from the workbook and will later be used by the clinical
 * distribution engine (Phase 3B) to enforce placement limits.
 *
 * department_id is nullable: some sites serve multiple departments (e.g. a
 * general hospital used by Internal Medicine AND Surgery). The column stores
 * the PRIMARY associated department only. A future phase will add a proper
 * many-to-many site_department_assignments table when the distribution engine
 * needs multi-department site capacity.
 *
 * agreement_status reflects the site's current cooperation agreement with the
 * university. Values observed in workbook: mostly blank. Enum includes 'none'
 * for explicitly "no agreement on file" vs null for "not yet assessed".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('training_sites', function (Blueprint $table) {
            $table->id();

            // e.g. "H-01" — stable identifier from workbook
            $table->string('site_code', 20)->unique()->index();

            $table->string('name_ar');
            $table->string('name_en')->nullable();

            $table->enum('site_type', [
                'hospital_public',
                'hospital_private',
                'medical_center',
                'clinic',
                'lab',
                'online',
                'other',
            ])->default('hospital_public')->index();

            $table->string('city')->nullable();
            $table->text('address')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->decimal('distance_km', 5, 2)->nullable();

            // Coordination contact
            $table->string('coordinator_name')->nullable();
            $table->string('coordinator_phone')->nullable();
            $table->string('coordinator_email')->nullable();

            // Formal agreement with university
            $table->enum('agreement_status', [
                'active', 'expired', 'pending', 'none',
            ])->nullable()->index();
            $table->date('agreement_start')->nullable();
            $table->date('agreement_end')->nullable();

            $table->boolean('has_university_transport')->default(false);

            // Primary clinical department this site is associated with
            $table->foreignId('department_id')
                ->nullable()
                ->constrained('departments')
                ->nullOnDelete()   // Deleting a department doesn't destroy site data
                ->index();

            // Capacity — used by future distribution engine
            $table->integer('bed_count')->unsigned()->nullable();
            $table->integer('max_students_per_period')->unsigned()->nullable();
            $table->tinyInteger('max_students_per_doctor')->unsigned()->nullable();

            $table->string('training_days')->nullable();   // e.g. "الأحد–الخميس"
            $table->boolean('accepts_night_shifts')->default(false);
            $table->string('female_student_restrictions')->nullable();

            $table->boolean('is_active')->default(true)->index();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('training_sites');
    }
};

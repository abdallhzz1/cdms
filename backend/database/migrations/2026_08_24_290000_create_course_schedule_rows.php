<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('course_schedule_rows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('distribution_version_id')->constrained('distribution_versions')->cascadeOnDelete();
            $table->enum('row_type', ['doctor', 'vacancy']);
            $table->foreignId('person_id')->nullable()->constrained('people')->restrictOnDelete();
            $table->foreignId('training_site_id')->constrained('training_sites')->restrictOnDelete();
            $table->string('label')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->unique(['distribution_version_id', 'person_id', 'training_site_id'], 'course_schedule_doctor_site_unique');
        });

        Schema::table('student_clinical_assignments', function (Blueprint $table) {
            $table->foreignId('course_schedule_row_id')->nullable()->after('distribution_version_id')
                ->constrained('course_schedule_rows')->nullOnDelete();
        });

        DB::table('permissions')->updateOrInsert(
            ['code' => 'distribution.schedule_rows.manage'],
            [
                'module' => 'Distribution',
                'action' => 'MANAGE_SCHEDULE_ROWS',
                'description_key' => 'permissions.distribution_schedule_rows_manage.description',
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }

    public function down(): void
    {
        Schema::table('student_clinical_assignments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('course_schedule_row_id');
        });
        Schema::dropIfExists('course_schedule_rows');
        DB::table('permissions')->where('code', 'distribution.schedule_rows.manage')->delete();
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // These values were schema placeholders, not verified staff data. Keeping
        // them made newly-created profiles look complete when they were not.
        DB::table('department_head_profiles')
            ->where('academic_title', 'أستاذ مشارك — استشاري سريري')
            ->update(['academic_title' => null]);
        DB::table('department_head_profiles')
            ->where('contract_type', 'عقد دائم — متفرغ')
            ->update(['contract_type' => null]);
        DB::table('department_head_profiles')
            ->where('appointment_date', '2024-09-01')
            ->update(['appointment_date' => null]);

        Schema::table('department_head_profiles', function (Blueprint $table) {
            $table->string('academic_title')->nullable()->default(null)->change();
            $table->string('contract_type')->nullable()->default(null)->change();
            $table->string('appointment_date')->nullable()->default(null)->change();
        });

        Schema::create('clinical_supervisor_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $table->string('academic_title')->nullable();
            $table->string('specialty')->nullable();
            $table->string('contract_type')->nullable();
            $table->string('appointment_date')->nullable();
            $table->string('phone')->nullable();
            $table->longText('avatar_url')->nullable();
            $table->string('avatar_storage_path')->nullable();
            $table->text('cv_summary')->nullable();
            $table->json('publications')->nullable();
            $table->json('conferences')->nullable();
            $table->json('documents')->nullable();
            $table->json('kpi_weights')->nullable();
            $table->json('kpi_overrides')->nullable();
            $table->json('evaluation')->nullable();
            $table->timestamps();
        });

        $supervisorUserIds = DB::table('user_roles')
            ->join('roles', 'roles.id', '=', 'user_roles.role_id')
            ->where('roles.code', 'CLINICAL_SUPERVISOR')
            ->pluck('user_roles.user_id');
        if ($supervisorUserIds->isNotEmpty()) {
            $columns = ['user_id', 'department_id', 'academic_title', 'specialty', 'contract_type', 'appointment_date', 'phone', 'avatar_url', 'avatar_storage_path', 'cv_summary', 'publications', 'conferences', 'documents', 'kpi_weights', 'kpi_overrides', 'evaluation', 'created_at', 'updated_at'];
            $profiles = DB::table('department_head_profiles')->whereIn('user_id', $supervisorUserIds)
                ->orderByDesc('id')->get($columns)->unique('user_id');
            foreach ($profiles as $profile) {
                DB::table('clinical_supervisor_profiles')->insert((array) $profile);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('clinical_supervisor_profiles');
    }
};

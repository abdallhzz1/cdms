<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('students', function (Blueprint $table) {
            $table->string('academic_registration_status', 20)->default('registered')->after('registration_status');
            $table->index(['academic_level', 'academic_registration_status'], 'student_level_academic_registration_idx');
        });

        Schema::create('group_registration_cycles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('academic_year_id')->constrained()->restrictOnDelete();
            $table->string('academic_level', 20);
            $table->uuid('public_id')->unique();
            $table->string('status', 20)->default('draft');
            $table->unsignedTinyInteger('default_capacity')->default(6);
            $table->timestamp('opens_at')->nullable();
            $table->timestamp('closes_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['academic_year_id', 'academic_level'], 'registration_cycle_year_level_unique');
        });

        Schema::create('student_group_rosters', function (Blueprint $table) {
            $table->id();
            $table->foreignId('group_registration_cycle_id')->constrained('group_registration_cycles', indexName: 'roster_cycle_fk')->cascadeOnDelete();
            $table->foreignId('student_id')->constrained()->restrictOnDelete();
            $table->foreignId('student_group_id')->constrained()->restrictOnDelete();
            $table->timestamps();
            $table->unique(['group_registration_cycle_id', 'student_id'], 'roster_cycle_student_unique');
        });

        Schema::create('group_registration_otp_challenges', function (Blueprint $table) {
            $table->id();
            $table->foreignId('group_registration_cycle_id')->constrained('group_registration_cycles', indexName: 'otp_cycle_fk')->cascadeOnDelete();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->string('challenge_token_hash', 64)->unique();
            $table->string('otp_hash');
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamp('expires_at');
            $table->timestamp('verified_at')->nullable();
            $table->string('access_token_hash', 64)->nullable()->unique();
            $table->timestamp('access_expires_at')->nullable();
            $table->timestamp('consumed_at')->nullable();
            $table->string('request_ip_hash', 64)->nullable();
            $table->timestamps();
        });

        $permissions = [
            ['code' => 'group_registration.view', 'module' => 'GroupRegistration', 'action' => 'view'],
            ['code' => 'group_registration.manage_roster', 'module' => 'GroupRegistration', 'action' => 'manage_roster'],
            ['code' => 'group_registration.manage_groups', 'module' => 'GroupRegistration', 'action' => 'manage_groups'],
            ['code' => 'group_registration.open_close', 'module' => 'GroupRegistration', 'action' => 'open_close'],
            ['code' => 'group_registration.override', 'module' => 'GroupRegistration', 'action' => 'override'],
            ['code' => 'group_registration.export', 'module' => 'GroupRegistration', 'action' => 'export'],
        ];
        foreach ($permissions as $permission) {
            DB::table('permissions')->updateOrInsert(['code' => $permission['code']], [...$permission, 'description_key' => $permission['code'], 'updated_at' => now(), 'created_at' => now()]);
        }
        $roleIds = DB::table('roles')->whereIn('code', ['ADMIN_ASSISTANT', 'CLINICAL_DIRECTOR'])->pluck('id');
        $permissionIds = DB::table('permissions')->whereIn('code', collect($permissions)->pluck('code'))->pluck('id');
        foreach ($roleIds as $roleId) foreach ($permissionIds as $permissionId) {
            DB::table('role_permissions')->updateOrInsert(['role_id' => $roleId, 'permission_id' => $permissionId], ['scope_type' => 'global', 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('group_registration_otp_challenges');
        Schema::dropIfExists('student_group_rosters');
        Schema::dropIfExists('group_registration_cycles');
        Schema::table('students', function (Blueprint $table) {
            $table->dropIndex('student_level_academic_registration_idx');
            $table->dropColumn('academic_registration_status');
        });
    }
};

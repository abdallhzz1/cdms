<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('student_events', function (Blueprint $table) {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->string('type', 20);
            $table->string('title_ar');
            $table->string('title_en');
            $table->text('description_ar')->nullable();
            $table->text('description_en')->nullable();
            $table->string('location_ar');
            $table->string('location_en');
            $table->dateTime('starts_at');
            $table->dateTime('ends_at');
            $table->dateTime('check_in_opens_at');
            $table->dateTime('check_in_closes_at');
            $table->json('eligible_levels');
            $table->string('status', 20)->default('draft');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['status', 'starts_at']);
        });

        Schema::create('student_event_attendances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_event_id')->constrained('student_events')->restrictOnDelete();
            $table->foreignId('student_id')->constrained()->restrictOnDelete();
            $table->dateTime('checked_in_at');
            $table->string('source', 20);
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('reason')->nullable();
            $table->dateTime('voided_at')->nullable();
            $table->foreignId('voided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('void_reason')->nullable();
            $table->timestamps();
            $table->unique(['student_event_id', 'student_id'], 'student_event_attendance_unique');
            $table->index(['student_event_id', 'voided_at']);
        });

        foreach (['student_events.view' => 'view', 'student_events.manage' => 'manage', 'student_events.attendance.manage' => 'attendance_manage'] as $code => $action) {
            DB::table('permissions')->updateOrInsert(['code' => $code], [
                'module' => 'StudentEvents', 'action' => $action, 'description_key' => $code,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        // Existing installations do not rerun seeders during deployment.
        $roleIds = DB::table('roles')->whereIn('code', ['SYS_ADMIN', 'CLINICAL_DIRECTOR', 'RTA'])->pluck('id');
        $permissionIds = DB::table('permissions')->whereIn('code', ['student_events.view', 'student_events.manage', 'student_events.attendance.manage'])->pluck('id');
        foreach ($roleIds as $roleId) foreach ($permissionIds as $permissionId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $permissionId],
                ['scope_type' => 'global', 'created_at' => now(), 'updated_at' => now()]
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('student_event_attendances');
        Schema::dropIfExists('student_events');
        DB::table('role_permissions')->whereIn('permission_id', DB::table('permissions')->where('module', 'StudentEvents')->select('id'))->delete();
        DB::table('permissions')->where('module', 'StudentEvents')->delete();
    }
};

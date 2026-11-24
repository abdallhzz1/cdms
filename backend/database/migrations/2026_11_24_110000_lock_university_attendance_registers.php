<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('clinical_university_sessions', 'approved_at')) {
            Schema::table('clinical_university_sessions', function (Blueprint $table) {
                $table->timestamp('approved_at')->nullable();
            });
        }
        if (! Schema::hasColumn('clinical_university_sessions', 'approved_by_user_id')) {
            Schema::table('clinical_university_sessions', function (Blueprint $table) {
                $table->foreignId('approved_by_user_id')->nullable()->constrained('users', indexName: 'cu_sessions_approver_fk')->nullOnDelete();
            });
        }
        $code = 'university_lectures.attendance.correct_approved';
        DB::table('permissions')->updateOrInsert(['code' => $code], ['module' => 'University Lectures', 'action' => 'CORRECT_APPROVED', 'description_key' => 'permissions.university_lectures_attendance_correct_approved.description', 'created_at' => now(), 'updated_at' => now()]);
        $permissionId = DB::table('permissions')->where('code', $code)->value('id');
        foreach (DB::table('roles')->where('code', 'ADMIN_ASSISTANT')->pluck('id') as $roleId) {
            DB::table('role_permissions')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $permissionId, 'scope_type' => 'global', 'created_at' => now(), 'updated_at' => now()]);
        }
        // Existing manual/closed QR registers are sealed by the application.
        // Do not invent historical approvers or modify existing attendance rows.
    }

    public function down(): void
    {
        $id = DB::table('permissions')->where('code', 'university_lectures.attendance.correct_approved')->value('id');
        if ($id) {
            DB::table('role_permissions')->where('permission_id', $id)->delete();
            DB::table('permissions')->where('id', $id)->delete();
        }
        Schema::table('clinical_university_sessions', function (Blueprint $table) {
            $table->dropForeign('cu_sessions_approver_fk');
            $table->dropColumn(['approved_at', 'approved_by_user_id']);
        });
    }
};

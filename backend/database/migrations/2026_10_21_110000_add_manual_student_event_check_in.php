<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('student_events', function (Blueprint $table) {
            // Existing published events start closed until an authorized organizer opens them.
            $table->boolean('check_in_enabled')->default(false);
            $table->dateTime('check_in_opened_at')->nullable();
            $table->dateTime('check_in_closed_at')->nullable();
        });

        DB::table('permissions')->updateOrInsert(['code' => 'student_events.delete'], [
            'module' => 'StudentEvents', 'action' => 'delete',
            'description_key' => 'permissions.student_events_delete.description',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $permissionId = DB::table('permissions')->where('code', 'student_events.delete')->value('id');
        foreach (DB::table('roles')->where('code', 'SYS_ADMIN')->pluck('id') as $roleId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $permissionId],
                ['scope_type' => 'global', 'created_at' => now(), 'updated_at' => now()]
            );
        }
    }

    public function down(): void
    {
        $permissionId = DB::table('permissions')->where('code', 'student_events.delete')->value('id');
        if ($permissionId) {
            DB::table('role_permissions')->where('permission_id', $permissionId)->delete();
            DB::table('permissions')->where('id', $permissionId)->delete();
        }
        Schema::table('student_events', function (Blueprint $table) {
            $table->dropColumn(['check_in_enabled', 'check_in_opened_at', 'check_in_closed_at']);
        });
    }
};

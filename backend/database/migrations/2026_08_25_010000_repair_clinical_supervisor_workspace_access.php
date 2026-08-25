<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        $permissionId = DB::table('permissions')->where('code', 'supervisor.workspace.view')->value('id');

        if (! $permissionId) {
            $permissionId = DB::table('permissions')->insertGetId([
                'code' => 'supervisor.workspace.view',
                'module' => 'Assessment',
                'action' => 'VIEW_OWN_WORKSPACE',
                'description_key' => 'permissions.supervisor_workspace_view.description',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $roleId = DB::table('roles')->where('code', 'CLINICAL_SUPERVISOR')->value('id');
        if (! $roleId) {
            return;
        }

        DB::table('role_permissions')->updateOrInsert(
            ['role_id' => $roleId, 'permission_id' => $permissionId],
            ['scope_type' => 'global', 'updated_at' => $now, 'created_at' => $now],
        );

        $supervisors = DB::table('users')
            ->join('user_roles', 'user_roles.user_id', '=', 'users.id')
            ->where('user_roles.role_id', $roleId)
            ->select('users.id', 'users.name', 'users.email')
            ->get();

        foreach ($supervisors as $user) {
            $person = DB::table('people')->where('user_id', $user->id)->first();
            if (! $person) {
                $person = DB::table('people')
                    ->whereNull('user_id')
                    ->whereRaw('LOWER(email) = ?', [strtolower($user->email)])
                    ->first();
            }

            if ($person) {
                DB::table('people')->where('id', $person->id)->update([
                    'user_id' => $user->id,
                    'email' => $user->email,
                    'is_active' => true,
                    'updated_at' => $now,
                ]);
            } else {
                $personId = DB::table('people')->insertGetId([
                    'user_id' => $user->id,
                    'full_name_ar' => $user->name,
                    'full_name_en' => $user->name,
                    'email' => $user->email,
                    'is_active' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
                $person = DB::table('people')->where('id', $personId)->first();
            }

            if (Schema::hasTable('clinical_supervisor_profiles')) {
                DB::table('clinical_supervisor_profiles')->updateOrInsert(
                    ['user_id' => $user->id],
                    [
                        'department_id' => $person->department_id ?? null,
                        'updated_at' => $now,
                        'created_at' => $now,
                    ],
                );
            }
        }
    }

    public function down(): void
    {
        // Access and identity repairs are intentionally retained on rollback.
    }
};

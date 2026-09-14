<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        foreach ([
            ['code' => 'departments.view', 'action' => 'VIEW', 'description_key' => 'permissions.departments_view.description'],
            ['code' => 'departments.manage', 'action' => 'MANAGE', 'description_key' => 'permissions.departments_manage.description'],
        ] as $permission) {
            DB::table('permissions')->updateOrInsert(
                ['code' => $permission['code']],
                [
                    'module' => 'Departments',
                    'action' => $permission['action'],
                    'description_key' => $permission['description_key'],
                    'updated_at' => $now,
                    'created_at' => $now,
                ],
            );
        }
    }

    public function down(): void
    {
        // These canonical permissions may already be assigned to roles, so rollback keeps them intact.
    }
};

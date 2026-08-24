<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $permissions = [
            ['code' => 'rotations.view', 'action' => 'VIEW', 'description_key' => 'permissions.rotations_view.description'],
            ['code' => 'rotations.create', 'action' => 'CREATE', 'description_key' => 'permissions.rotations_create.description'],
            ['code' => 'rotations.update', 'action' => 'UPDATE', 'description_key' => 'permissions.rotations_update.description'],
            ['code' => 'rotations.delete', 'action' => 'DELETE', 'description_key' => 'permissions.rotations_delete.description'],
        ];

        foreach ($permissions as $permission) {
            $values = [
                'module' => 'Rotations',
                'action' => $permission['action'],
                'description_key' => $permission['description_key'],
                'updated_at' => now(),
            ];

            if (DB::table('permissions')->where('code', $permission['code'])->exists()) {
                DB::table('permissions')->where('code', $permission['code'])->update($values);
            } else {
                DB::table('permissions')->insert([
                    'code' => $permission['code'],
                    ...$values,
                    'created_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        // Keep the permissions because routes rely on their stable codes.
    }
};

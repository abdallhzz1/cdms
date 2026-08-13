<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Order matters: roles and permissions must exist before grants are
     * attached, and roles must exist before the dev admin can be assigned
     * one. DevAdminUserSeeder no-ops itself outside local/SEED_DEV_ADMIN —
     * see its own doc comment.
     */
    public function run(): void
    {
        $this->call([
            RoleSeeder::class,
            PermissionSeeder::class,
            RolePermissionSeeder::class,
            DevAdminUserSeeder::class,
        ]);
    }
}

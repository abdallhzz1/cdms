<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

/**
 * Phase 3A permissions — new module permissions not present in Phase 2.
 *
 * These extend the existing PermissionSeeder rather than replacing it.
 * Modules covered: academic_years, departments, people, groups,
 * training_sites, partnerships.
 *
 * Note: students.* permissions already exist from Phase 2 PermissionSeeder.
 * This seeder only adds what is NEW.
 */
class Phase3PermissionSeeder extends Seeder
{
    public function run(): void
    {
        $permissions = [
            // Academic Years
            ['code' => 'academic_years.view',   'module' => 'Academic Years', 'action' => 'VIEW',   'description_key' => 'permissions.academic_years_view.description'],
            ['code' => 'academic_years.manage', 'module' => 'Academic Years', 'action' => 'MANAGE', 'description_key' => 'permissions.academic_years_manage.description'],

            // Rotations
            ['code' => 'rotations.view',   'module' => 'Rotations', 'action' => 'VIEW',   'description_key' => 'permissions.rotations_view.description'],
            ['code' => 'rotations.create', 'module' => 'Rotations', 'action' => 'CREATE', 'description_key' => 'permissions.rotations_create.description'],
            ['code' => 'rotations.update', 'module' => 'Rotations', 'action' => 'UPDATE', 'description_key' => 'permissions.rotations_update.description'],
            ['code' => 'rotations.delete', 'module' => 'Rotations', 'action' => 'DELETE', 'description_key' => 'permissions.rotations_delete.description'],

            // Departments
            ['code' => 'departments.view',   'module' => 'Departments', 'action' => 'VIEW',   'description_key' => 'permissions.departments_view.description'],
            ['code' => 'departments.manage', 'module' => 'Departments', 'action' => 'MANAGE', 'description_key' => 'permissions.departments_manage.description'],

            // People / Staff
            ['code' => 'people.view',   'module' => 'People', 'action' => 'VIEW',   'description_key' => 'permissions.people_view.description'],
            ['code' => 'people.manage', 'module' => 'People', 'action' => 'MANAGE', 'description_key' => 'permissions.people_manage.description'],

            // Student Groups
            ['code' => 'groups.view',   'module' => 'Groups', 'action' => 'VIEW',   'description_key' => 'permissions.groups_view.description'],
            ['code' => 'groups.manage', 'module' => 'Groups', 'action' => 'MANAGE', 'description_key' => 'permissions.groups_manage.description'],

            // Training Sites
            ['code' => 'training_sites.view',   'module' => 'Training Sites', 'action' => 'VIEW',   'description_key' => 'permissions.training_sites_view.description'],
            ['code' => 'training_sites.manage', 'module' => 'Training Sites', 'action' => 'MANAGE', 'description_key' => 'permissions.training_sites_manage.description'],

            // Partnerships
            ['code' => 'partnerships.view',   'module' => 'Partnerships', 'action' => 'VIEW',   'description_key' => 'permissions.partnerships_view.description'],
            ['code' => 'partnerships.manage', 'module' => 'Partnerships', 'action' => 'MANAGE', 'description_key' => 'permissions.partnerships_manage.description'],
        ];

        foreach ($permissions as $permission) {
            Permission::updateOrCreate(['code' => $permission['code']], $permission);
        }
    }
}

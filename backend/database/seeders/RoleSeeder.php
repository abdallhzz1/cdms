<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

/**
 * The 10 roles, verbatim from Clinical_Department_Permission_Matrix_Workflows_v1.xlsx
 * (`Roles` sheet). Not invented, not renamed, not reordered — this is the
 * approved actor list re-confirmed in PROJECT_RULES.md/ARCHITECTURE.md and
 * Prompt 02 §3 ("Vice Dean is independent"). Display text lives in
 * frontend/src/i18n/locales/{en,ar}.ts under the matching `roles.<code>.*`
 * keys, never in this table (Prompt 02 §7).
 */
class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $roles = [
            ['code' => 'SYS_ADMIN', 'name_key' => 'roles.sys_admin.name', 'description_key' => 'roles.sys_admin.description'],
            ['code' => 'DEAN', 'name_key' => 'roles.dean.name', 'description_key' => 'roles.dean.description'],
            ['code' => 'VICE_DEAN', 'name_key' => 'roles.vice_dean.name', 'description_key' => 'roles.vice_dean.description'],
            ['code' => 'CLINICAL_DIRECTOR', 'name_key' => 'roles.clinical_director.name', 'description_key' => 'roles.clinical_director.description'],
            ['code' => 'ADMIN_ASSISTANT', 'name_key' => 'roles.admin_assistant.name', 'description_key' => 'roles.admin_assistant.description'],
            ['code' => 'DEPARTMENT_HEAD', 'name_key' => 'roles.department_head.name', 'description_key' => 'roles.department_head.description'],
            ['code' => 'RTA', 'name_key' => 'roles.rta.name', 'description_key' => 'roles.rta.description'],
            ['code' => 'CLINICAL_SUPERVISOR', 'name_key' => 'roles.clinical_supervisor.name', 'description_key' => 'roles.clinical_supervisor.description'],
            ['code' => 'ACADEMIC_ADVISOR', 'name_key' => 'roles.academic_advisor.name', 'description_key' => 'roles.academic_advisor.description'],
            ['code' => 'QUALITY', 'name_key' => 'roles.quality.name', 'description_key' => 'roles.quality.description'],
        ];

        foreach ($roles as $role) {
            Role::updateOrCreate(['code' => $role['code']], $role);
        }
    }
}

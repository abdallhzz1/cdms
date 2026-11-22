<?php

namespace Database\Seeders;

use App\Models\{Permission, Role};
use Illuminate\Database\Seeder;

class SupervisorFollowupPermissionSeeder extends Seeder
{
    public function run(): void
    {
        $codes = ['clinical_supervisors.view', 'clinical_supervisors.update', 'supervisor_documents.view', 'supervisor_documents.upload', 'supervisor_documents.delete', 'supervisor_records.view', 'supervisor_records.create', 'supervisor_records.review', 'supervisor_records.delete'];
        $ids = [];
        foreach ($codes as $code) {
            $ids[$code] = Permission::firstOrCreate(['code' => $code], [
                'module' => 'Clinical Supervisors', 'action' => strtoupper(explode('.', $code)[1]),
                'description_key' => 'supervisor_followup.permissions.'.str_replace('.', '_', $code),
            ])->id;
        }
        $basic = ['clinical_supervisors.view', 'supervisor_documents.view', 'supervisor_documents.upload', 'supervisor_records.view', 'supervisor_records.create'];
        foreach ([
            'CLINICAL_DIRECTOR' => [...$codes],
            'RTA' => [...$basic, 'supervisor_records.review'],
            'ADMIN_ASSISTANT' => [...$basic, 'clinical_supervisors.update'],
        ] as $roleCode => $grants) {
            if ($role = Role::where('code', $roleCode)->first()) {
                $role->permissions()->syncWithoutDetaching(collect($grants)->mapWithKeys(fn ($code) => [$ids[$code] => ['scope_type' => 'global']])->all());
            }
        }
    }
}

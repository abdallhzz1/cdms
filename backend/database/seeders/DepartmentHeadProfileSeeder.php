<?php

namespace Database\Seeders;

use App\Models\DepartmentHeadProfile;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

class DepartmentHeadProfileSeeder extends Seeder
{
    public function run(): void
    {
        $headRole = Role::where('code', 'DEPARTMENT_HEAD')->first();

        if (!$headRole) return;

        $headUsers = User::whereHas('roles', function ($q) use ($headRole) {
            $q->where('roles.id', $headRole->id);
        })->get();

        foreach ($headUsers as $user) {
            DepartmentHeadProfile::firstOrCreate(
                ['user_id' => $user->id],
                [
                    'academic_title' => 'أستاذ مشارك — استشاري سريري',
                    'specialty' => $user->person && $user->person->department ? 'استشاري ' . $user->person->department->name_ar : 'استشاري سريري',
                    'contract_type' => 'عقد دائم — متفرغ',
                    'appointment_date' => '2024-09-01',
                    'phone' => $user->person ? $user->person->primary_phone : '+970 599 000000',
                    'publications' => [],
                    'conferences' => [],
                    'kpi_weights' => [
                        'gradeTimelinessWeight' => 25,
                        'rotationMgmtWeight' => 25,
                        'researchWeight' => 20,
                        'confWeight' => 15,
                        'evaluationWeight' => 15,
                    ],
                ]
            );
        }
    }
}

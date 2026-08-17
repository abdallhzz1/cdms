<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\Person;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class RealOrganizationSeeder extends Seeder
{
    public function run(): void
    {
        $roles = Role::pluck('id', 'code')->toArray();

        // 1. Create Top Leadership
        $this->createStaff('العميد البروفسور سليم الحاج يحيى', 'dean@hebron.edu', [$roles['DEAN']], null);
        $this->createStaff('نائب العميد الدكتورة كارول الجعبري', 'vicedean@hebron.edu', [$roles['VICE_DEAN']], null);
        $this->createStaff('مدير الدائرة السريرية الدكتور معتز التميمي', 'clinicaldirector@hebron.edu', [$roles['CLINICAL_DIRECTOR']], null);

        // 2. Create Departments and their staff
        $departmentsData = [
            [
                'name_ar' => 'الباطني',
                'name_en' => 'Internal Medicine',
                'head' => 'الدكتور عبدالله',
                'head_email' => 'abdallah.im@hebron.edu',
                'rta' => 'الدكتور باسل الحروب',
                'rta_email' => 'basel.rta@hebron.edu'
            ],
            [
                'name_ar' => 'الجراحة',
                'name_en' => 'Surgery',
                'head' => 'الدكتور اياد الجدع',
                'head_email' => 'iyad.surgery@hebron.edu',
                'rta' => 'الدكتورة سفانة عجوة',
                'rta_email' => 'safanah.rta@hebron.edu'
            ],
            [
                'name_ar' => 'الأطفال',
                'name_en' => 'Pediatrics',
                'head' => 'الدكتور فوزي ابو نجمة',
                'head_email' => 'fawzi.peds@hebron.edu',
                'rta' => 'الدكتورة سعاد ابو غزالة',
                'rta_email' => 'souad.rta@hebron.edu'
            ],
            [
                'name_ar' => 'النسائية',
                'name_en' => 'Obstetrics & Gynecology',
                'head' => 'الدكتور اياد عفانة',
                'head_email' => 'iyad.obgyn@hebron.edu',
                'rta' => 'الدكتورة شذى',
                'rta_email' => 'shatha.rta@hebron.edu'
            ],
            [
                'name_ar' => 'جراحات تخصصية',
                'name_en' => 'Specialized Surgeries',
                'head' => 'الدكتور هشام نصار',
                'head_email' => 'hisham.ss@hebron.edu',
                'rta' => null,
                'rta_email' => null
            ],
            [
                'name_ar' => 'تخصصات باطنية فرعية',
                'name_en' => 'Sub-specialty Internal Medicine',
                'head' => 'الدكتور بسام البشيتي',
                'head_email' => 'bassam.subim@hebron.edu',
                'rta' => null,
                'rta_email' => null
            ]
        ];

        $deptCodes = [
            'الباطني' => 'IM',
            'الجراحة' => 'SURG',
            'الأطفال' => 'PEDS',
            'النسائية' => 'OBGYN',
            'جراحات تخصصية' => 'SSURG',
            'تخصصات باطنية فرعية' => 'SUBIM'
        ];

        foreach ($departmentsData as $deptData) {
            $department = Department::firstOrCreate(
                ['name_ar' => $deptData['name_ar']],
                ['name_en' => $deptData['name_en'], 'code' => $deptCodes[$deptData['name_ar']], 'dept_type' => 'primary', 'is_active' => true]
            );

            // Create Head
            if ($deptData['head']) {
                $head = $this->createStaff($deptData['head'], $deptData['head_email'], [$roles['DEPARTMENT_HEAD'], $roles['CLINICAL_SUPERVISOR']], $department->id);
            }

            // Create RTA
            if ($deptData['rta']) {
                $this->createStaff($deptData['rta'], $deptData['rta_email'], [$roles['RTA']], $department->id);
            }
        }
    }

    private function createStaff($name, $email, $roleIds, $departmentId)
    {
        $user = User::firstOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'password' => Hash::make('password123'),
                'is_active' => true,
            ]
        );

        $user->roles()->syncWithoutDetaching($roleIds);

        $person = Person::firstOrCreate(
            ['user_id' => $user->id],
            [
                'staff_code' => 'STF-' . rand(1000, 9999),
                'full_name_ar' => $name,
                'email' => $email,
                'department_id' => $departmentId,
                'is_active' => true
            ]
        );

        return $person;
    }
}

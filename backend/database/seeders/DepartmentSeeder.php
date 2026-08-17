<?php

namespace Database\Seeders;

use App\Models\Department;
use Illuminate\Database\Seeder;

/**
 * Seeds the 7 clinical departments from workbook sheet 14 (13_الأقسام).
 * Data taken verbatim — codes, names, types, and the academic levels
 * each department serves. Safe to run multiple times (updateOrCreate).
 *
 * Note: Department head / RTA assignments are NOT seeded here — those
 * require people records which will be created by a separate seeder or
 * the import process in a later phase.
 */
class DepartmentSeeder extends Seeder
{
    public function run(): void
    {
        $departments = [
            [
                'code'                   => 'DEP-IM',
                'name_ar'                => 'الطب الباطني',
                'name_en'                => 'Internal Medicine',
                'dept_type'              => 'primary',
                'serves_academic_levels' => ['fourth', 'sixth'],
                'is_active'              => true,
                'notes'                  => 'Workbook: رئيسي — note: "الاسم في الموقع: عبد الله زعارير — للتأكيد"',
            ],
            [
                'code'                   => 'DEP-GS',
                'name_ar'                => 'الجراحة العامة',
                'name_en'                => 'General Surgery',
                'dept_type'              => 'primary',
                'serves_academic_levels' => ['fourth', 'sixth'],
                'is_active'              => true,
                'notes'                  => null,
            ],
            [
                'code'                   => 'DEP-PED',
                'name_ar'                => 'طب الأطفال',
                'name_en'                => 'Pediatrics',
                'dept_type'              => 'primary',
                'serves_academic_levels' => ['fifth', 'sixth'],
                'is_active'              => true,
                'notes'                  => null,
            ],
            [
                'code'                   => 'DEP-OBG',
                'name_ar'                => 'النساء والتوليد',
                'name_en'                => 'Obstetrics & Gynecology',
                'dept_type'              => 'primary',
                'serves_academic_levels' => ['fifth', 'sixth'],
                'is_active'              => true,
                'notes'                  => 'Workbook: "تعارض في الاسم بين ملخص الدائرة والموقع — للحسم"',
            ],
            [
                'code'                   => 'DEP-SSS',
                'name_ar'                => 'التخصصات الجراحية الفرعية',
                'name_en'                => 'Surgical Subspecialties',
                'dept_type'              => 'sub',
                'serves_academic_levels' => ['fourth', 'fifth'],
                'is_active'              => true,
                'notes'                  => null,
            ],
            [
                'code'                   => 'DEP-IMS',
                'name_ar'                => 'التخصصات الباطنية الفرعية',
                'name_en'                => 'Internal Medicine Subspecialties',
                'dept_type'              => 'sub',
                'serves_academic_levels' => ['fourth'],
                'is_active'              => true,
                'notes'                  => 'Workbook: "تعارض في الاسم الأول بين المصدرين — للحسم"',
            ],
            [
                'code'                   => 'DEP-FCM',
                'name_ar'                => 'طب الأسرة والمجتمع',
                'name_en'                => 'Family & Community Medicine',
                'dept_type'              => 'sub',
                'serves_academic_levels' => ['fifth'],
                'is_active'              => true,
                'notes'                  => 'Workbook: "قسم وارد في موقع الجامعة وغير وارد في الملخص الأولي"',
            ],
        ];

        foreach ($departments as $dept) {
            Department::updateOrCreate(['code' => $dept['code']], $dept);
        }
    }
}

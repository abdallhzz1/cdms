<?php

use Illuminate\Database\Migrations\Migration;
use App\Models\Department;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $officialDepartments = [
            [
                'code'                   => 'DEP-IM',
                'name_ar'                => 'الطب الباطني',
                'name_en'                => 'Internal Medicine',
                'dept_type'              => 'primary',
                'serves_academic_levels' => ['الرابعة', 'السادسة'],
                'is_active'              => true,
            ],
            [
                'code'                   => 'DEP-GS',
                'name_ar'                => 'الجراحة العامة',
                'name_en'                => 'General Surgery',
                'dept_type'              => 'primary',
                'serves_academic_levels' => ['الرابعة', 'السادسة'],
                'is_active'              => true,
            ],
            [
                'code'                   => 'DEP-PED',
                'name_ar'                => 'طب الأطفال',
                'name_en'                => 'Pediatrics',
                'dept_type'              => 'primary',
                'serves_academic_levels' => ['الخامسة', 'السادسة'],
                'is_active'              => true,
            ],
            [
                'code'                   => 'DEP-OBG',
                'name_ar'                => 'النساء والتوليد',
                'name_en'                => 'Obstetrics & Gynecology',
                'dept_type'              => 'primary',
                'serves_academic_levels' => ['الخامسة', 'السادسة'],
                'is_active'              => true,
            ],
            [
                'code'                   => 'DEP-SSS',
                'name_ar'                => 'التخصصات الجراحية الفرعية',
                'name_en'                => 'Surgical Subspecialties',
                'dept_type'              => 'sub',
                'serves_academic_levels' => ['الرابعة', 'الخامسة'],
                'is_active'              => true,
            ],
            [
                'code'                   => 'DEP-IMS',
                'name_ar'                => 'التخصصات الباطنية الفرعية',
                'name_en'                => 'Internal Medicine Subspecialties',
                'dept_type'              => 'sub',
                'serves_academic_levels' => ['الرابعة'],
                'is_active'              => true,
            ],
            [
                'code'                   => 'DEP-FCM',
                'name_ar'                => 'طب الأسرة والمجتمع',
                'name_en'                => 'Family & Community Medicine',
                'dept_type'              => 'sub',
                'serves_academic_levels' => ['الخامسة'],
                'is_active'              => true,
            ],
        ];

        // 1. Sync or insert the 7 official departments
        $codeToId = [];
        foreach ($officialDepartments as $deptData) {
            $dept = Department::updateOrCreate(
                ['code' => $deptData['code']],
                [
                    'name_ar'                => $deptData['name_ar'],
                    'name_en'                => $deptData['name_en'],
                    'dept_type'              => $deptData['dept_type'],
                    'serves_academic_levels' => $deptData['serves_academic_levels'],
                    'is_active'              => true,
                ]
            );
            $codeToId[$deptData['code']] = $dept->id;
        }

        $imId   = $codeToId['DEP-IM'];
        $gsId   = $codeToId['DEP-GS'];
        $pedId  = $codeToId['DEP-PED'];
        $obgId  = $codeToId['DEP-OBG'];
        $sssId  = $codeToId['DEP-SSS'];
        $imsId  = $codeToId['DEP-IMS'];

        // Map legacy test codes to official IDs
        $legacyMapping = [
            'IM'    => $imId,
            'INT'   => $imId,
            'SURG'  => $gsId,
            'PEDS'  => $pedId,
            'OBGYN' => $obgId,
            'SSURG' => $sssId,
            'SUBIM' => $imsId,
        ];

        $keepIds = array_values($codeToId);

        // Re-point foreign keys
        $tablesWithDeptId = ['rotation_blocks', 'courses', 'people', 'training_sites'];
        foreach ($legacyMapping as $legacyCode => $targetId) {
            $oldDept = Department::where('code', $legacyCode)->first();
            if ($oldDept && !in_array($oldDept->id, $keepIds)) {
                foreach ($tablesWithDeptId as $table) {
                    if (Schema::hasTable($table) && Schema::hasColumn($table, 'department_id')) {
                        DB::table($table)->where('department_id', $oldDept->id)->update(['department_id' => $targetId]);
                    }
                }
                if (Schema::hasTable('department_head_assignments')) {
                    DB::table('department_head_assignments')->where('department_id', $oldDept->id)->delete();
                }
                $oldDept->delete();
            }
        }

        // Delete any remaining departments not in keepIds
        $remainingDuplicates = Department::whereNotIn('id', $keepIds)->get();
        foreach ($remainingDuplicates as $dup) {
            foreach ($tablesWithDeptId as $table) {
                if (Schema::hasTable($table) && Schema::hasColumn($table, 'department_id')) {
                    DB::table($table)->where('department_id', $dup->id)->update(['department_id' => $imId]);
                }
            }
            if (Schema::hasTable('department_head_assignments')) {
                DB::table('department_head_assignments')->where('department_id', $dup->id)->delete();
            }
            $dup->delete();
        }
    }

    public function down(): void
    {
    }
};

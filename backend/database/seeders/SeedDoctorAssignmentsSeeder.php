<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\DistributionVersion;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\Student;
use App\Models\StudentGroup;
use App\Models\StudentSubgroup;
use App\Models\StudentClinicalAssignment;
use App\Models\Person;
use App\Models\TrainingSite;
use App\Models\Department;
use App\Models\AcademicYear;

class SeedDoctorAssignmentsSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Ensure Academic Year
        $academicYear = AcademicYear::firstOrCreate(
            ['code' => '2026/2027'],
            ['start_date' => '2026-09-01', 'end_date' => '2027-06-30', 'is_current' => true]
        );

        // 2. Ensure Departments & Training Sites
        $internalDept = Department::firstOrCreate(['code' => 'INT'], ['name_ar' => 'قسم الباطني العام', 'name_en' => 'Internal Medicine']);
        $surgeryDept  = Department::firstOrCreate(['code' => 'SURG'], ['name_ar' => 'قسم الجراحة العامة', 'name_en' => 'General Surgery']);
        $obgynDept    = Department::firstOrCreate(['code' => 'OBGYN'], ['name_ar' => 'قسم النسائية والتوليد', 'name_en' => 'Obstetrics & Gynecology']);
        $pedsDept     = Department::firstOrCreate(['code' => 'PEDS'], ['name_ar' => 'قسم طب الأطفال', 'name_en' => 'Pediatrics']);

        $duraHospital   = TrainingSite::firstOrCreate(['site_code' => 'H-DURA'], ['name_ar' => 'مستشفى دورا الحكومي', 'name_en' => 'Dura Govt Hospital']);
        $ahliHospital   = TrainingSite::firstOrCreate(['site_code' => 'H-AHLI'], ['name_ar' => 'مستشفى الأهلي', 'name_en' => 'Al-Ahli Hospital']);
        $hilalHospital  = TrainingSite::firstOrCreate(['site_code' => 'H-HILAL'], ['name_ar' => 'مستشفى الهلال الأحمر', 'name_en' => 'Red Crescent Hospital']);
        $aliaHospital   = TrainingSite::firstOrCreate(['site_code' => 'H-ALIA'], ['name_ar' => 'مستشفى عالية الحكومي', 'name_en' => 'Alia Govt Hospital']);
        $beitjalaSite   = TrainingSite::firstOrCreate(['site_code' => 'H-BEITJALA'], ['name_ar' => 'مستشفى بيت جالا', 'name_en' => 'Beit Jala Hospital']);

        // 3. Ensure Rotation & Blocks
        $rotation = Rotation::firstOrCreate(
            ['academic_year_id' => $academicYear->id, 'code' => 'ROT-4TH-2026'],
            ['name' => 'الرحلة السريرية الرابعة 2026/2027', 'academic_level' => 'fourth', 'duration_weeks' => 12]
        );

        $block1 = RotationBlock::firstOrCreate(
            ['rotation_id' => $rotation->id, 'block_code' => 'الكتلة A (أسبوع 1 - 4)'],
            ['from_week' => 1, 'to_week' => 4, 'department_id' => $surgeryDept->id]
        );

        $block2 = RotationBlock::firstOrCreate(
            ['rotation_id' => $rotation->id, 'block_code' => 'الكتلة B (أسبوع 5 - 8)'],
            ['from_week' => 5, 'to_week' => 8, 'department_id' => $internalDept->id]
        );

        $block3 = RotationBlock::firstOrCreate(
            ['rotation_id' => $rotation->id, 'block_code' => 'الكتلة C (أسبوع 9 - 12)'],
            ['from_week' => 9, 'to_week' => 12, 'department_id' => $obgynDept->id]
        );

        $distVersion = DistributionVersion::firstOrCreate(
            ['rotation_id' => $rotation->id, 'name' => 'النسخة الرسمية 2026'],
            ['status' => 'published', 'is_current' => true]
        );

        DistributionVersion::where('id', '!=', $distVersion->id)->update(['is_current' => false]);
        $distVersion->update(['status' => 'published', 'is_current' => true]);

        // 5. Ensure Students
        $studentsList = [
            ['name' => 'أحمد محمود خالد القواسمي', 'num' => '20211045', 'level' => 'fourth'],
            ['name' => 'سارة إبراهيم علي النتشة', 'num' => '20211088', 'level' => 'fourth'],
            ['name' => 'عمر يوسف عبد الفتاح العزة', 'num' => '20211102', 'level' => 'fourth'],
            ['name' => 'نور خليل طارق حمادة', 'num' => '20201015', 'level' => 'fifth'],
            ['name' => 'محمد مصطفى سعيد أبو اسنينة', 'num' => '20201042', 'level' => 'fifth'],
            ['name' => 'فاطمة الزهراء علي المحتسب', 'num' => '20211204', 'level' => 'fourth'],
            ['name' => 'خالد عبد الرحمن الرجبي', 'num' => '20211215', 'level' => 'fourth'],
            ['name' => 'ليان ناصر الدين الشريف', 'num' => '20211230', 'level' => 'fourth'],
            ['name' => 'طارق زياد عابدين', 'num' => '20201105', 'level' => 'fifth'],
            ['name' => 'رغد إسماعيل مسودة', 'num' => '20201140', 'level' => 'fifth'],
            ['name' => 'حمزة مصعب الجعبري', 'num' => '20211310', 'level' => 'fourth'],
            ['name' => 'مريم يحيى دعنا', 'num' => '20211345', 'level' => 'fourth'],
            ['name' => 'بسام علي البكري', 'num' => '20201201', 'level' => 'fifth'],
            ['name' => 'هدى محمود زلوم', 'num' => '20201250', 'level' => 'fifth'],
            ['name' => 'أنس طارق سدر', 'num' => '20211402', 'level' => 'fourth'],
        ];

        $studentModels = [];
        foreach ($studentsList as $stData) {
            $studentModels[] = Student::firstOrCreate(
                ['university_number' => $stData['num']],
                [
                    'full_name_ar'   => $stData['name'],
                    'full_name_en'   => $stData['name'],
                    'academic_level' => $stData['level'],
                ]
            );
        }

        // 6. Ensure Groups & Subgroups
        $mainGroupA = StudentGroup::firstOrCreate(['name' => 'المجموعة الرئسية A', 'academic_year_id' => $academicYear->id]);
        $mainGroupB = StudentGroup::firstOrCreate(['name' => 'المجموعة الرئسية B', 'academic_year_id' => $academicYear->id]);
        $mainGroupC = StudentGroup::firstOrCreate(['name' => 'المجموعة الرئسية C', 'academic_year_id' => $academicYear->id]);

        $subA1 = StudentSubgroup::firstOrCreate(['name' => 'المجموعة الفرعية A1', 'student_group_id' => $mainGroupA->id]);
        $subA2 = StudentSubgroup::firstOrCreate(['name' => 'المجموعة الفرعية A2', 'student_group_id' => $mainGroupA->id]);
        $subB1 = StudentSubgroup::firstOrCreate(['name' => 'المجموعة الفرعية B1', 'student_group_id' => $mainGroupB->id]);
        $subB2 = StudentSubgroup::firstOrCreate(['name' => 'المجموعة الفرعية B2', 'student_group_id' => $mainGroupB->id]);
        $subC1 = StudentSubgroup::firstOrCreate(['name' => 'المجموعة الفرعية C1', 'student_group_id' => $mainGroupC->id]);

        // Clear existing test assignments
        StudentClinicalAssignment::where('distribution_version_id', $distVersion->id)->delete();

        // 7. Map Doctors to unique groups, blocks, hospitals, and students
        $supervisors = Person::whereNotNull('email')->get();

        $doctorPlans = [
            'د. حمزة الزهور' => [
                'site' => $duraHospital,
                'dept' => $surgeryDept,
                'subgroup' => $subA1,
                'block' => $block1,
                'students' => [$studentModels[0], $studentModels[1], $studentModels[2]],
            ],
            'د. صابرين رجوب' => [
                'site' => $duraHospital,
                'dept' => $pedsDept,
                'subgroup' => $subA2,
                'block' => $block2,
                'students' => [$studentModels[3], $studentModels[4]],
            ],
            'د. عبد الله قاسم' => [
                'site' => $ahliHospital,
                'dept' => $internalDept,
                'subgroup' => $subB1,
                'block' => $block1,
                'students' => [$studentModels[5], $studentModels[6], $studentModels[7]],
            ],
            'د. محمد زهور' => [
                'site' => $hilalHospital,
                'dept' => $obgynDept,
                'subgroup' => $subB2,
                'block' => $block1,
                'students' => [$studentModels[8], $studentModels[9], $studentModels[10]],
            ],
            'د. اشرف افغانة' => [
                'site' => $aliaHospital,
                'dept' => $surgeryDept,
                'subgroup' => $subC1,
                'block' => $block2,
                'students' => [$studentModels[11], $studentModels[12]],
            ],
            'د. زيدان زيدان' => [
                'site' => $beitjalaSite,
                'dept' => $internalDept,
                'subgroup' => $subC1,
                'block' => $block3,
                'students' => [$studentModels[13], $studentModels[14]],
            ],
        ];

        // Process mapped doctors
        foreach ($doctorPlans as $docName => $plan) {
            $doctor = Person::where('full_name_ar', 'like', "%{$docName}%")->first();
            if ($doctor) {
                foreach ($plan['students'] as $st) {
                    StudentClinicalAssignment::firstOrCreate(
                        [
                            'distribution_version_id' => $distVersion->id,
                            'student_id'              => $st->id,
                            'rotation_block_id'       => $plan['block']->id,
                        ],
                        [
                            'supervisor_id'       => $doctor->id,
                            'student_subgroup_id' => $plan['subgroup']->id,
                            'training_site_id'    => $plan['site']->id,
                            'department_id'       => $plan['dept']->id,
                        ]
                    );
                }
            }
        }

        // For all other supervisors, assign students with rotating blocks to prevent duplicate student-block assignments
        $otherSupervisors = Person::whereNotIn('full_name_ar', array_keys($doctorPlans))->get();
        $subgroups = [$subA1, $subA2, $subB1, $subB2, $subC1];
        $blocks    = [$block1, $block2, $block3];
        $sites     = [$ahliHospital, $hilalHospital, $aliaHospital, $duraHospital];
        $depts     = [$internalDept, $surgeryDept, $obgynDept, $pedsDept];

        foreach ($otherSupervisors as $idx => $supervisor) {
            $st1 = $studentModels[$idx % count($studentModels)];
            $st2 = $studentModels[($idx + 1) % count($studentModels)];
            
            $assignedSubgroup = $subgroups[$idx % count($subgroups)];
            $assignedBlock    = $blocks[$idx % count($blocks)];
            $assignedSite     = $sites[$idx % count($sites)];
            $assignedDept     = $depts[$idx % count($depts)];

            StudentClinicalAssignment::firstOrCreate(
                [
                    'distribution_version_id' => $distVersion->id,
                    'student_id'              => $st1->id,
                    'rotation_block_id'       => $assignedBlock->id,
                ],
                [
                    'supervisor_id'       => $supervisor->id,
                    'student_subgroup_id' => $assignedSubgroup->id,
                    'training_site_id'    => $assignedSite->id,
                    'department_id'       => $assignedDept->id,
                ]
            );

            $assignedBlock2 = $blocks[($idx + 1) % count($blocks)];
            StudentClinicalAssignment::firstOrCreate(
                [
                    'distribution_version_id' => $distVersion->id,
                    'student_id'              => $st2->id,
                    'rotation_block_id'       => $assignedBlock2->id,
                ],
                [
                    'supervisor_id'       => $supervisor->id,
                    'student_subgroup_id' => $assignedSubgroup->id,
                    'training_site_id'    => $assignedSite->id,
                    'department_id'       => $assignedDept->id,
                ]
            );
        }
    }
}

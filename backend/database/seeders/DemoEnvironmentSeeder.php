<?php

namespace Database\Seeders;

use App\Models\AcademicYear;
use App\Models\Department;
use App\Models\DistributionVersion;
use App\Models\Person;
use App\Models\Role;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\SiteCapacityRule;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use App\Models\TrainingSite;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * A deterministic, fictional local-development dataset. It deliberately
 * exercises published/current isolation, unassigned students, site capacity,
 * and supervisor workload without bypassing the application schema.
 */
class DemoEnvironmentSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function (): void {
            $years = $this->seedAcademicYears();
            $departments = $this->seedDepartments();
            $sites = $this->seedSites($departments);
            $admin = $this->seedUsers();
            $supervisors = $this->seedSupervisors($departments, $sites);
            $students = $this->seedStudents($years['2026/2027']);
            $this->seedDistributions($years['2026/2027'], $departments, $sites, $supervisors, $students);

            // A demo administrator needs the existing permission checks to
            // allow a complete demonstration; authorization remains enforced.
            $role = Role::where('code', 'SYS_ADMIN')->firstOrFail();
            $role->permissions()->syncWithoutDetaching(
                \App\Models\Permission::pluck('id')->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all()
            );
            $admin->roles()->syncWithoutDetaching([$role->id]);
        });
    }

    /** @return array<string, AcademicYear> */
    private function seedAcademicYears(): array
    {
        $years = [];
        foreach ([2023, 2024, 2025, 2026] as $start) {
            $code = $start.'/'.($start + 1);
            $years[$code] = AcademicYear::create([
                'code' => $code, 'start_date' => "$start-09-01", 'end_date' => ($start + 1).'-06-30',
                'semester1_start' => "$start-09-01", 'semester1_end' => ($start + 1).'-01-31',
                'semester2_start' => ($start + 1).'-02-01', 'semester2_end' => ($start + 1).'-06-30',
                'is_current' => $start === 2026, 'status' => 'active', 'notes' => 'بيانات تطوير تجريبية خيالية',
            ]);
        }
        return $years;
    }

    /** @return array<int, Department> */
    private function seedDepartments(): array
    {
        $rows = [
            ['DEP-IM', 'الطب الباطني', 'Internal Medicine'], ['DEP-SUR', 'الجراحة', 'Surgery'],
            ['DEP-PED', 'طب الأطفال', 'Pediatrics'], ['DEP-OBG', 'النسائية والتوليد', 'Obstetrics and Gynecology'],
            ['DEP-FM', 'طب الأسرة', 'Family Medicine'], ['DEP-EM', 'طب الطوارئ', 'Emergency Medicine'],
            ['DEP-PSY', 'الطب النفسي', 'Psychiatry'], ['DEP-RAD', 'الأشعة', 'Radiology'],
            ['DEP-AN', 'التخدير', 'Anesthesiology'],
        ];
        $departments = [];
        foreach ($rows as [$code, $ar, $en]) {
            $departments[] = Department::create(['code' => $code, 'name_ar' => $ar, 'name_en' => $en, 'dept_type' => 'primary', 'serves_academic_levels' => ['fourth', 'fifth', 'sixth'], 'is_active' => true]);
        }
        return $departments;
    }

    /** @param array<int, Department> $departments @return array<int, TrainingSite> */
    private function seedSites(array $departments): array
    {
        $rows = [
            ['SITE-01', 'مستشفى الجامعة التعليمي', 'University Teaching Hospital', 'hospital_public', 'الخليل'],
            ['SITE-02', 'مستشفى القدس التخصصي', 'Al-Quds Specialty Hospital', 'hospital_private', 'القدس'],
            ['SITE-03', 'مستشفى الأمل الحكومي', 'Al-Amal Government Hospital', 'hospital_public', 'رام الله'],
            ['SITE-04', 'مستشفى الشفاء', 'Al-Shifa Hospital', 'hospital_public', 'بيت لحم'],
            ['SITE-05', 'مركز الحياة الطبي', 'Al-Hayat Medical Center', 'medical_center', 'الخليل'],
            ['SITE-06', 'مستشفى السلام الأهلي', 'Al-Salam Community Hospital', 'hospital_private', 'جنين'],
            ['SITE-07', 'مركز الأسرة الصحي', 'Family Health Center', 'clinic', 'رام الله'],
            ['SITE-08', 'مستشفى الرحمة', 'Al-Rahma Hospital', 'hospital_private', 'نابلس'],
            ['SITE-09', 'مركز التشخيص المتقدم', 'Advanced Diagnostic Center', 'medical_center', 'طوباس'],
            ['SITE-10', 'مستشفى الكرامة', 'Al-Karama Hospital', 'hospital_public', 'أريحا'],
        ];
        $sites = [];
        foreach ($rows as $index => [$code, $ar, $en, $type, $city]) {
            $sites[] = TrainingSite::create(['site_code' => $code, 'name_ar' => $ar, 'name_en' => $en, 'site_type' => $type, 'city' => $city, 'department_id' => $departments[$index % count($departments)]->id, 'agreement_status' => 'active', 'agreement_start' => '2026-01-01', 'agreement_end' => '2028-12-31', 'max_students_per_period' => 30, 'max_students_per_doctor' => 8, 'is_active' => true, 'notes' => 'موقع تدريبي تجريبي']);
        }
        return $sites;
    }

    private function seedUsers(): User
    {
        $email = (string) env('DEV_ADMIN_EMAIL', 'admin@cdms.local');
        $password = (string) env('DEV_ADMIN_PASSWORD', '');
        if ($password === '') {
            throw new \RuntimeException('Set DEV_ADMIN_PASSWORD before running cdms:demo-reset; it is never stored in source code.');
        }
        $admin = User::create(['name' => 'مدير النظام السريري', 'email' => $email, 'password' => $password, 'is_active' => true]);
        for ($i = 1; $i <= 9; $i++) {
            User::create(['name' => "مستخدم تجريبي {$i}", 'email' => "demo.user{$i}@cdms.local", 'password' => Str::password(20), 'is_active' => true]);
        }
        return $admin;
    }

    /** @param array<int, Department> $departments @param array<int, TrainingSite> $sites @return array<int, Person> */
    private function seedSupervisors(array $departments, array $sites): array
    {
        $arabicFirst = ['أحمد', 'ليان', 'سامر', 'رنا', 'مروان', 'هبة', 'ياسر', 'ندى', 'طارق', 'ريم', 'فارس', 'سلمى', 'كريم', 'دانا', 'نادر', 'سناء', 'وسام', 'آية', 'باسل', 'ميس'];
        $englishFirst = ['Ahmad', 'Layan', 'Samer', 'Rana', 'Marwan', 'Hiba', 'Yaser', 'Nada', 'Tareq', 'Reem', 'Fares', 'Salma', 'Karim', 'Dana', 'Nader', 'Sanaa', 'Wissam', 'Aya', 'Basel', 'Mais'];
        $surnamesAr = ['الخطيب', 'التميمي', 'البرغوثي', 'النجار', 'الزعبي', 'الحداد', 'العابد', 'القدومي', 'الرمحي', 'الشامي'];
        $surnamesEn = ['Al-Khatib', 'Al-Tamimi', 'Al-Barghouti', 'Al-Najjar', 'Al-Zoubi', 'Al-Haddad', 'Al-Abed', 'Al-Qudoumi', 'Al-Ramahi', 'Al-Shami'];
        $people = [];
        foreach ($arabicFirst as $i => $first) {
            $surname = $i % 10;
            $people[] = Person::create(['staff_code' => sprintf('SUP-%03d', $i + 1), 'full_name_ar' => "د. {$first} {$surnamesAr[$surname]}", 'full_name_en' => "Dr. {$englishFirst[$i]} {$surnamesEn[$surname]}", 'email' => 'supervisor'.($i + 1).'@cdms.local', 'department_id' => $departments[$i % count($departments)]->id, 'primary_site_id' => $sites[$i % count($sites)]->id, 'specialty' => $departments[$i % count($departments)]->name_en, 'academic_degree' => 'MD', 'contract_type' => 'part_time', 'max_students' => $i === 0 ? 8 : 12, 'is_active' => $i !== 19]);
        }
        return $people;
    }

    /** @return array<int, Student> */
    private function seedStudents(AcademicYear $year): array
    {
        $firstAr = ['لين', 'محمد', 'تالا', 'عمر', 'سجى', 'آدم', 'نور', 'يزن', 'جود', 'كندا', 'زيد', 'رؤى'];
        $firstEn = ['Lina', 'Mohammad', 'Tala', 'Omar', 'Saja', 'Adam', 'Noor', 'Yazan', 'Joud', 'Kinda', 'Zaid', 'Roa'];
        $lastAr = ['أبو عيشة', 'البدوي', 'الدويك', 'عوض', 'العمري', 'الكيلاني', 'عريقات', 'سليم', 'منصور', 'نصار', 'حمدان', 'الخضر'];
        $lastEn = ['Abu Aisheh', 'Al-Badawi', 'Al-Dweik', 'Awad', 'Al-Omari', 'Al-Kilani', 'Erekat', 'Salim', 'Mansour', 'Nassar', 'Hamdan', 'Al-Khader'];
        $groups = [];
        foreach (['fourth', 'fifth', 'sixth'] as $level) {
            for ($g = 1; $g <= 3; $g++) {
                $group = StudentGroup::create(['academic_year_id' => $year->id, 'name' => "{$level}-{$g}", 'academic_level' => $level, 'capacity' => 30, 'group_type' => 'clinical']);
                $groups[$level][] = ['group' => $group, 'subgroup' => StudentSubgroup::create(['student_group_id' => $group->id, 'name' => "{$level}-{$g}-A", 'capacity' => 15, 'is_active' => true])];
            }
        }
        $students = [];
        for ($i = 0; $i < 216; $i++) {
            $level = ['fourth', 'fifth', 'sixth'][$i % 3];
            $groupData = $groups[$level][intdiv($i, 3) % 3];
            $first = $i % 12; $last = intdiv($i, 12) % 12;
            $student = Student::create(['university_number' => '2026'.str_pad((string) ($i + 1), 4, '0', STR_PAD_LEFT), 'full_name_ar' => $firstAr[$first].' '.$lastAr[$last], 'full_name_en' => $firstEn[$first].' '.$lastEn[$last], 'gender' => $i % 2 === 0 ? 'female' : 'male', 'city' => 'الخليل', 'university_email' => 'student.'.($i + 1).'@example.invalid', 'batch_year' => 2020 + ($i % 3), 'academic_level' => $level, 'academic_year_id' => $year->id, 'registration_status' => 'active', 'clinical_fees_status' => 'paid', 'has_amboss_subscription' => true, 'data_source' => 'demo']);
            StudentGroupAssignment::create(['assignment_code' => sprintf('DEMO-SGA-%03d', $i + 1), 'student_id' => $student->id, 'academic_year_id' => $year->id, 'student_group_id' => $groupData['group']->id, 'student_subgroup_id' => $groupData['subgroup']->id, 'valid_from' => '2026-09-01', 'data_source' => 'demo']);
            $students[] = $student;
        }
        return $students;
    }

    /** @param array<int, Department> $departments @param array<int, TrainingSite> $sites @param array<int, Person> $supervisors @param array<int, Student> $students */
    private function seedDistributions(AcademicYear $year, array $departments, array $sites, array $supervisors, array $students): void
    {
        $rotation = Rotation::create(['academic_year_id' => $year->id, 'code' => 'CLN-2026', 'name' => 'التدريب السريري المتكامل 2026/2027', 'academic_level' => 'sixth', 'duration_weeks' => 12, 'start_date' => '2026-09-01', 'end_date' => '2026-11-24', 'status' => 'active']);
        $rotation->departments()->sync(collect($departments)->pluck('id')->all());
        $blocks = [];
        foreach (array_slice($departments, 0, 3) as $index => $department) {
            $blocks[] = RotationBlock::create(['rotation_id' => $rotation->id, 'block_code' => 'CLN-B'.($index + 1), 'from_week' => $index * 4 + 1, 'to_week' => ($index + 1) * 4, 'department_id' => $department->id]);
        }
        // The first site is intentionally over capacity, the second is full,
        // and the sixth is near capacity (four of five placements).
        $limits = [45, 45, 40, 35, 30, 5, 20, 20, 15, 15];
        foreach ($sites as $i => $site) SiteCapacityRule::create(['site_id' => $site->id, 'rotation_id' => $rotation->id, 'max_students' => $limits[$i], 'notes' => 'قاعدة سعة تجريبية']);

        $old = DistributionVersion::create(['rotation_id' => $rotation->id, 'name' => 'التوزيع السريري السابق', 'status' => 'published', 'is_current' => false]);
        $current = DistributionVersion::create(['rotation_id' => $rotation->id, 'name' => 'التوزيع السريري الحالي', 'status' => 'published', 'is_current' => true]);
        DistributionVersion::create(['rotation_id' => $rotation->id, 'name' => 'توزيع مقترح للمراجعة', 'status' => 'suggested', 'is_current' => false]);

        // 204 placements leave twelve clearly visible unassigned students.
        foreach (array_slice($students, 0, 204) as $i => $student) {
            $siteIndex = $i < 50 ? 0 : ($i < 95 ? 1 : ($i < 135 ? 2 : ($i < 170 ? 3 : ($i < 200 ? 4 : 5))));
            StudentClinicalAssignment::create(['distribution_version_id' => $current->id, 'student_id' => $student->id, 'rotation_block_id' => $blocks[$i % 3]->id, 'training_site_id' => $sites[$siteIndex]->id, 'department_id' => $blocks[$i % 3]->department_id, 'supervisor_id' => $supervisors[$i < 10 ? 0 : (($i % 18) + 1)]->id]);
        }
        foreach (array_slice($students, 0, 20) as $i => $student) {
            StudentClinicalAssignment::create(['distribution_version_id' => $old->id, 'student_id' => $student->id, 'rotation_block_id' => $blocks[$i % 3]->id, 'training_site_id' => $sites[7]->id, 'department_id' => $blocks[$i % 3]->department_id, 'supervisor_id' => $supervisors[2]->id]);
        }
    }
}

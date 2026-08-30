<?php

namespace Database\Seeders;

use App\Models\Course;
use Illuminate\Database\Seeder;

class ClinicalCurriculumCoursesSeeder extends Seeder
{
    public function run(): void
    {
        $courses = [
            ['M1470', 'جراحة عامة (مبتدئ)', 'General Surgery (Introductory)', 12, 'fourth'],
            ['M1480', 'مقدمة في الطب السريري (في الصف)', 'Introduction to Clinical Medicine (Classroom)', 4, 'fourth'],
            ['M1481', 'الطب النفسي والعلوم السلوكية', 'Psychiatry and Behavioral Sciences', 4, 'fourth'],
            ['M1492', 'طرق البحث (في الصف)', 'Research Methods (Classroom)', 2, 'fourth'],
            ['M1460', 'الطب الباطني مبتدئ', 'Internal Medicine (Introductory)', 12, 'fourth'],
            ['M1461', 'الجلدية', 'Dermatology', 2, 'fourth'],
            ['M1462', 'علم الأعصاب السريرية', 'Clinical Neurology', 4, 'fourth'],
            ['N1471', 'طب وجراحة العيون 2', 'Ophthalmology 2', 2, 'fourth'],
            ['M1490', 'مساق اختياري حر 1', 'Free Elective 1', 4, 'fourth'],

            ['M1574', 'تخدير وإنعاش', 'Anesthesia and Resuscitation', 2, 'fifth'],
            ['M1582', 'التوليد والأمراض النسائية (مبتدئ)', 'Obstetrics and Gynecology (Introductory)', 8, 'fifth'],
            ['M1583', 'طب الأطفال (مبتدئ)', 'Pediatrics (Introductory)', 12, 'fifth'],
            ['M1563', 'تخصصات طبية مختارة', 'Selected Medical Specialties', 2, 'fifth'],
            ['M1566', 'تخصصات جراحية مختارة', 'Selected Surgical Specialties', 2, 'fifth'],
            ['M1571', 'جراحة العظام والكسور، حالات الطوارئ الجراحية', 'Orthopedics, Fractures, and Surgical Emergencies', 4, 'fifth'],
            ['M1572', 'الأنف والأذن والحنجرة', 'Otorhinolaryngology', 2, 'fifth'],
            ['M1584', 'الطب الشرعي', 'Forensic Medicine', 2, 'fifth'],
            ['M1587', 'التصوير الطبي (في الصف)', 'Medical Imaging (Classroom)', 2, 'fifth'],
            ['M1594', 'مشروع بحث 1 (في الصف)', 'Research Project 1 (Classroom)', 2, 'fifth'],
            ['M1593', 'طب الأسرة والمجتمع', 'Family and Community Medicine', 4, 'fifth'],
            ['M1596', 'مساق اختياري حر 2', 'Free Elective 2', 4, 'fifth'],

            ['M1661', 'الطب الباطني متقدم', 'Internal Medicine (Advanced)', 8, 'sixth'],
            ['M1662', 'طب القلب', 'Cardiology', 2, 'sixth'],
            ['M1673', 'جراحة عامة متقدم', 'General Surgery (Advanced)', 8, 'sixth'],
            ['M1687', 'طب طوارئ', 'Emergency Medicine', 4, 'sixth'],
            ['M1677', 'جراحة القلب والصدر والأوعية الدموية', 'Cardiothoracic and Vascular Surgery', 2, 'sixth'],
            ['M1688', 'طب الأطفال متقدم', 'Pediatrics (Advanced)', 6, 'sixth'],
            ['M1689', 'التوليد والأمراض النسائية (متقدم)', 'Obstetrics and Gynecology (Advanced)', 6, 'sixth'],
            ['M1693', 'مشروع بحث 2 (في الصف)', 'Research Project 2 (Classroom)', 4, 'sixth'],
            ['M169', 'الإدارة الصحية', 'Health Administration', 2, 'sixth'],
        ];

        foreach ($courses as [$code, $nameAr, $nameEn, $creditHours, $level]) {
            Course::query()->updateOrCreate(
                ['code' => $code],
                [
                    'name_ar' => $nameAr,
                    'name_en' => $nameEn,
                    'credit_hours' => $creditHours,
                    'academic_level' => $level,
                    'semester' => null,
                    'is_active' => true,
                    'description' => 'Annual clinical curriculum course.',
                ],
            );
        }
    }
}

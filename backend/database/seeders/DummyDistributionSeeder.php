<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Department;
use App\Models\TrainingSite;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\AcademicYear;
use App\Models\DistributionVersion;

class DummyDistributionSeeder extends Seeder
{
    public function run(): void
    {
        // Get or create academic year
        $year = AcademicYear::firstOrCreate(
            ['code' => '2026/2027'],
            ['start_date' => '2026-09-01', 'end_date' => '2027-06-30', 'is_current' => true]
        );

        // Get department 1
        $dept = Department::find(1) ?? Department::firstOrCreate(['id' => 1], ['name_ar' => 'Internal Medicine', 'name_en' => 'Internal Medicine', 'code' => 'IM', 'color_code' => '#FF0000', 'is_active' => true]);

        // Create Training Site 1
        $site = TrainingSite::firstOrCreate(['id' => 1], ['name_ar' => 'Al-Hussein Hospital', 'name_en' => 'Al-Hussein Hospital', 'site_code' => 'AHH', 'city' => 'Amman', 'is_active' => true, 'notes' => 'Dummy Data']);

        // Create a rotation
        $rotation = Rotation::firstOrCreate(['id' => 1], [
            'academic_year_id' => $year->id,
            'name' => 'IM Rotation 2026', 'code' => 'IM-2026',
            'start_date' => '2026-09-01',
            'end_date' => '2026-10-01',
            'status' => 'DRAFT'
        ]);
        
        $rotation->departments()->syncWithoutDetaching([$dept->id ]);

        // Create a block
        $block = RotationBlock::firstOrCreate(['id' => 1], [
            'rotation_id' => $rotation->id,
            'block_code' => 'B-1', 'from_week' => 1, 'to_week' => 4, 'department_id' => 1
        ]);

        // Create a distribution version
        $version = DistributionVersion::firstOrCreate(['id' => 1], [
            'rotation_id' => $rotation->id,
            'status' => 'PUBLISHED',
            'is_current' => true,
            
        ]);
        
        echo "Dummy data seeded!";
    }
}

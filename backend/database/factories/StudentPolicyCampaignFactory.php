<?php

namespace Database\Factories;

use App\Models\AcademicYear;
use App\Models\StudentPolicyCampaign;
use App\Models\StudentPolicyDocument;
use Illuminate\Database\Eloquent\Factories\Factory;

class StudentPolicyCampaignFactory extends Factory
{
    protected $model = StudentPolicyCampaign::class;
    public function definition(): array
    {
        return ['student_policy_document_id' => StudentPolicyDocument::factory(), 'academic_year_id' => AcademicYear::factory(),
            'target_levels' => ['fourth'], 'deadline' => now()->addMonth()->toDateString(), 'status' => 'draft'];
    }
}

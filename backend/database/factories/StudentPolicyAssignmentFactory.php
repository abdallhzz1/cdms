<?php

namespace Database\Factories;

use App\Models\Student;
use App\Models\StudentPolicyAssignment;
use App\Models\StudentPolicyCampaign;
use Illuminate\Database\Eloquent\Factories\Factory;

class StudentPolicyAssignmentFactory extends Factory
{
    protected $model = StudentPolicyAssignment::class;
    public function definition(): array
    {
        return ['campaign_id' => StudentPolicyCampaign::factory(), 'student_id' => Student::factory()];
    }
}

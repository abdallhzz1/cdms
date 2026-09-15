<?php

namespace Database\Factories;

use App\Models\StudentPolicyDocument;
use Illuminate\Database\Eloquent\Factories\Factory;

class StudentPolicyDocumentFactory extends Factory
{
    protected $model = StudentPolicyDocument::class;
    public function definition(): array
    {
        return ['title_ar' => 'مدونة سلوك طلبة الطب', 'title_en' => 'Medical Students Code of Conduct',
            'version_label' => $this->faker->unique()->numerify('2026.##'), 'effective_date' => now()->toDateString(),
            'storage_path' => 'student-policies/test.pdf', 'original_name' => 'conduct.pdf', 'mime_type' => 'application/pdf',
            'size_bytes' => 100, 'sha256' => str_repeat('a', 64)];
    }
}

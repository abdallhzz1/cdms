<?php

namespace App\Models;

use Database\Factories\StudentPolicyDocumentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StudentPolicyDocument extends Model
{
    /** @use HasFactory<StudentPolicyDocumentFactory> */
    use HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['effective_date' => 'date', 'published_at' => 'datetime'];
    }

    public function campaigns(): HasMany
    {
        return $this->hasMany(StudentPolicyCampaign::class);
    }
}

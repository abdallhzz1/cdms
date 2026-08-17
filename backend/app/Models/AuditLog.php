<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'action',
        'entity_type',
        'entity_id',
        'distribution_version_id',
        'student_id',
        'changes',
        'is_override',
        'override_reason'
    ];

    protected $casts = [
        'changes' => 'array',
        'is_override' => 'boolean',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function distributionVersion()
    {
        return $this->belongsTo(DistributionVersion::class);
    }
}

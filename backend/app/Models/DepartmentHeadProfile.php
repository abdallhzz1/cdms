<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DepartmentHeadProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'department_id',
        'academic_title',
        'specialty',
        'contract_type',
        'appointment_date',
        'phone',
        'avatar_url',
        'avatar_storage_path',
        'cv_summary',
        'publications',
        'conferences',
        'documents',
        'kpi_weights',
        'kpi_overrides',
        'evaluation',
    ];

    protected $casts = [
        'publications' => 'array',
        'conferences' => 'array',
        'documents' => 'array',
        'kpi_weights' => 'array',
        'kpi_overrides' => 'array',
        'evaluation' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function department()
    {
        return $this->belongsTo(Department::class);
    }
}

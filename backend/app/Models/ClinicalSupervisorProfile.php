<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClinicalSupervisorProfile extends Model
{
    protected $guarded = [];

    protected $casts = [
        'publications' => 'array',
        'conferences' => 'array',
        'documents' => 'array',
        'kpi_weights' => 'array',
        'kpi_overrides' => 'array',
        'evaluation' => 'array',
    ];

    public function user() { return $this->belongsTo(User::class); }
    public function department() { return $this->belongsTo(Department::class); }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ClinicalDistributionPayload extends Model
{
    use HasFactory;

    protected $table = 'clinical_distribution_payloads';

    protected $fillable = [
        'key',
        'payload',
    ];

    protected $casts = [
        'payload' => 'array',
    ];
}

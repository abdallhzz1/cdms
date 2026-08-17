<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class SiteCapacityRule extends Model
{
    use HasFactory;

    protected $fillable = [
        'site_id',
        'rotation_id',
        'max_students',
        'notes',
    ];

    protected $casts = [
        'max_students' => 'integer',
    ];

    public function site()
    {
        return $this->belongsTo(TrainingSite::class, 'site_id');
    }

    public function rotation()
    {
        return $this->belongsTo(Rotation::class);
    }
}

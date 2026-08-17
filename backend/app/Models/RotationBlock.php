<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class RotationBlock extends Model
{
    use HasFactory;

    protected $fillable = [
        'rotation_id',
        'block_code',
        'from_week',
        'to_week',
        'department_id',
    ];

    protected $casts = [
        'from_week' => 'integer',
        'to_week' => 'integer',
    ];

    public function rotation()
    {
        return $this->belongsTo(Rotation::class);
    }

    public function department()
    {
        return $this->belongsTo(Department::class);
    }
}

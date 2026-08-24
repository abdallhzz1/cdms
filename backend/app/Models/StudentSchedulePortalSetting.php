<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentSchedulePortalSetting extends Model
{
    protected $fillable = ['is_enabled', 'updated_by'];

    protected function casts(): array
    {
        return ['is_enabled' => 'boolean'];
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public static function current(): self
    {
        return self::query()->firstOrCreate([], ['is_enabled' => true]);
    }
}

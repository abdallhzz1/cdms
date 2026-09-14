<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ConfidentialFinancialVault extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'title', 'description', 'share_token', 'share_token_hash', 'password_hash',
        'is_active', 'successful_access_count', 'last_accessed_at', 'created_by',
    ];

    protected $hidden = ['share_token', 'share_token_hash', 'password_hash'];

    protected $casts = [
        'share_token' => 'encrypted',
        'is_active' => 'boolean',
        'last_accessed_at' => 'datetime',
    ];

    public function files()
    {
        return $this->hasMany(ConfidentialFinancialFile::class);
    }

    public function accessSessions()
    {
        return $this->hasMany(ConfidentialFinancialAccessSession::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

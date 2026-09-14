<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ConfidentialFinancialAccessSession extends Model
{
    protected $fillable = [
        'confidential_financial_vault_id', 'token_hash', 'ip_hash',
        'user_agent_hash', 'expires_at', 'last_used_at',
    ];

    protected $hidden = ['token_hash', 'ip_hash', 'user_agent_hash'];

    protected $casts = [
        'expires_at' => 'datetime',
        'last_used_at' => 'datetime',
    ];

    public function vault()
    {
        return $this->belongsTo(ConfidentialFinancialVault::class, 'confidential_financial_vault_id');
    }
}

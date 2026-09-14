<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ConfidentialFinancialFile extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'confidential_financial_vault_id', 'uploaded_by', 'original_name',
        'stored_path', 'mime_type', 'file_size',
    ];

    protected $hidden = ['stored_path'];

    public function vault()
    {
        return $this->belongsTo(ConfidentialFinancialVault::class, 'confidential_financial_vault_id');
    }

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}

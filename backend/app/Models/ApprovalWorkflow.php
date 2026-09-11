<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApprovalWorkflow extends Model
{
    protected $fillable = ['code', 'name_ar', 'name_en', 'description_ar', 'description_en', 'is_active', 'prevent_requester_approval', 'require_distinct_approvers', 'updated_by'];
    protected $casts = ['is_active' => 'boolean', 'prevent_requester_approval' => 'boolean', 'require_distinct_approvers' => 'boolean'];
    public function steps() { return $this->hasMany(ApprovalWorkflowStep::class)->orderBy('step_order'); }
    public function requests() { return $this->hasMany(ApprovalRequest::class); }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApprovalWorkflowStep extends Model
{
    protected $fillable = ['approval_workflow_id', 'step_order', 'name_ar', 'name_en', 'role_codes'];
    protected $casts = ['role_codes' => 'array'];
    public function workflow() { return $this->belongsTo(ApprovalWorkflow::class, 'approval_workflow_id'); }
}

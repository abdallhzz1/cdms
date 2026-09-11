<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApprovalAction extends Model
{
    protected $fillable = ['approval_request_id', 'approval_workflow_step_id', 'actor_user_id', 'action', 'comment', 'metadata', 'acted_at'];
    protected $casts = ['metadata' => 'array', 'acted_at' => 'datetime'];
    public function request() { return $this->belongsTo(ApprovalRequest::class, 'approval_request_id'); }
    public function step() { return $this->belongsTo(ApprovalWorkflowStep::class, 'approval_workflow_step_id'); }
    public function actor() { return $this->belongsTo(User::class, 'actor_user_id'); }
}

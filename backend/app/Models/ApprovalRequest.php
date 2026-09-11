<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApprovalRequest extends Model
{
    protected $fillable = ['public_id', 'approval_workflow_id', 'subject_type', 'subject_id', 'title_ar', 'title_en', 'source_url', 'context', 'status', 'current_step_order', 'requested_by', 'requested_at', 'completed_at', 'returned_at'];
    protected $casts = ['context' => 'array', 'requested_at' => 'datetime', 'completed_at' => 'datetime', 'returned_at' => 'datetime'];
    public function workflow() { return $this->belongsTo(ApprovalWorkflow::class, 'approval_workflow_id'); }
    public function requester() { return $this->belongsTo(User::class, 'requested_by'); }
    public function actions() { return $this->hasMany(ApprovalAction::class)->orderBy('acted_at'); }
}

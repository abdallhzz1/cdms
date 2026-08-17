<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model;
class WorkflowTransitionLog extends Model { protected $fillable=['entity_type','entity_id','from_state','to_state','user_id','reason']; }

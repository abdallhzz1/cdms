<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class QualityFinding extends Model { protected $fillable=['reference','academic_year','source','category','title','description','severity','status','is_recurring','owner_user_id','due_date','root_cause','recommended_action','evidence_reference','quality_improvement_plan_id','created_by','closed_by','closed_at']; protected $casts=['is_recurring'=>'boolean','due_date'=>'date','closed_at'=>'datetime']; public function owner(){return $this->belongsTo(User::class,'owner_user_id');} public function plan(){return $this->belongsTo(QualityImprovementPlan::class,'quality_improvement_plan_id');} }

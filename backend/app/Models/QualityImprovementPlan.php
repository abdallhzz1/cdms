<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model;
class QualityImprovementPlan extends Model { protected $fillable=['academic_year','source','reference','observation','improvement_action','responsible','start_date','due_date','priority','status','closed_date','closure_evidence','verification_result','data_source']; protected $casts=['start_date'=>'date','due_date'=>'date','closed_date'=>'date']; }

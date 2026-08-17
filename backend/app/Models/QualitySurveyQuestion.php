<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model;
class QualitySurveyQuestion extends Model { protected $fillable=['quality_survey_id','version','question_number','question_text','question_type','options','is_required','weight','axis','active_from','active_until']; protected $casts=['is_required'=>'boolean','active_from'=>'date','active_until'=>'date']; public function survey(){return $this->belongsTo(QualitySurvey::class,'quality_survey_id');} }

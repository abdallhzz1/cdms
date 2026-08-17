<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model; use Illuminate\Database\Eloquent\Relations\BelongsTo;
class QualitySurveyResponse extends Model { protected $fillable=['quality_survey_id','quality_survey_question_id','version','responded_at','respondent_identifier','target_group','course_id','department_id','training_site_id','supervisor_person_id','numeric_answer','text_answer']; protected $casts=['responded_at'=>'datetime']; public function question():BelongsTo{return $this->belongsTo(QualitySurveyQuestion::class,'quality_survey_question_id');} }

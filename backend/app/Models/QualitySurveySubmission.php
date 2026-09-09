<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class QualitySurveySubmission extends Model { public $incrementing=false;protected $keyType='string';protected $fillable=['id','quality_survey_id','respondent_key','respondent_identifier','submitted_at'];protected $casts=['submitted_at'=>'datetime']; }

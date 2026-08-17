<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model;
class QualitySurvey extends Model { protected $fillable=['code','title','target_group','purpose','frequency','responsible','form_url','is_mandatory','notes','is_active']; protected $casts=['is_mandatory'=>'boolean','is_active'=>'boolean']; public function questions(){return $this->hasMany(QualitySurveyQuestion::class);} }

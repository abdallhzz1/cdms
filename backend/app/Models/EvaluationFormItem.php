<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class EvaluationFormItem extends Model { protected $fillable=['evaluation_form_version_id','item_code','item_text','domain','rating_scale','weight','program_outcome_code','applicable_courses','notes','data_source','archived_at']; protected function casts():array{return ['weight'=>'decimal:2'];} public function formVersion():BelongsTo{return $this->belongsTo(EvaluationFormVersion::class,'evaluation_form_version_id');} }

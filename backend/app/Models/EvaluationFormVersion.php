<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
class EvaluationFormVersion extends Model { protected $fillable=['form_code','name','version','department_id','course_id','evaluator_type','evaluatee_type','effective_from','effective_until','total_score','status','document_path','notes','data_source','archived_at']; protected function casts():array{return ['effective_from'=>'date','effective_until'=>'date','total_score'=>'decimal:2'];} public function department():BelongsTo{return $this->belongsTo(Department::class);} public function course():BelongsTo{return $this->belongsTo(Course::class);} public function items():HasMany{return $this->hasMany(EvaluationFormItem::class);} }

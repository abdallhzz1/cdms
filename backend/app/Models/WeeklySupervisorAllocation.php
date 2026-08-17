<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model; use Illuminate\Database\Eloquent\Relations\BelongsTo;
class WeeklySupervisorAllocation extends Model { protected $fillable=['academic_year','week_number','week_start','department_id','training_site_id','person_id','supervisor_name','subgroup','student_count','notes','data_source','archived_at']; public function department():BelongsTo{return $this->belongsTo(Department::class);} public function person():BelongsTo{return $this->belongsTo(Person::class);} }

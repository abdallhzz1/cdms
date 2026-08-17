<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model; class SupervisorAvailability extends Model { protected $fillable=['person_id','academic_year','available_from','available_until','day','from_time','until_time','department_id','training_site_id','status','reason','notes']; }

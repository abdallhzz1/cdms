<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model; class StaffAssignmentHistory extends Model { protected $fillable=['person_id','role_type','department_id','training_site_id','start_date','end_date','reference','status','notes']; }

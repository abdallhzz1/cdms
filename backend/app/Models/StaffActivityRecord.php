<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model; class StaffActivityRecord extends Model { protected $fillable=['person_id','activity_type','title','organizer','activity_date','location','role','duration','evidence_url','points','academic_year','notes']; }

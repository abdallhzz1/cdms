<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model; class AcademicCalendarEvent extends Model { protected $fillable=['academic_year_id','name','event_type','start_date','end_date','affected_levels','suspends_clinical_training','notes']; protected $casts=['start_date'=>'date','end_date'=>'date','suspends_clinical_training'=>'boolean']; }

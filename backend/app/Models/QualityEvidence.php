<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class QualityEvidence extends Model { protected $table='quality_evidence'; protected $fillable=['code','title','category','description','reference_url','document_version','issued_at','expires_at','status','owner_user_id','created_by']; protected $casts=['issued_at'=>'date','expires_at'=>'date']; public function owner(){return $this->belongsTo(User::class,'owner_user_id');} }

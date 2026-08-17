<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model;
class OperationalTask extends Model { protected $fillable=['title','description','due_date','priority','status']; protected $casts=['due_date'=>'date']; }

<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model;
class AnnualReportEntry extends Model { protected $fillable=['category','item','value_text','reporting_period','data_source']; }

<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model;
class QualityKpi extends Model { protected $fillable=['code','name','category','measurement_method','data_source','weight','target_value','measurement_frequency','responsible']; public function measurements(){return $this->hasMany(QualityKpiMeasurement::class)->latest('measured_at');} public function latestMeasurement(){return $this->hasOne(QualityKpiMeasurement::class)->latestOfMany('measured_at');} }

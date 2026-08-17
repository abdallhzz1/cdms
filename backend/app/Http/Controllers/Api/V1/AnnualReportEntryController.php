<?php
namespace App\Http\Controllers\Api\V1;
use App\Http\Controllers\Controller; use App\Http\Responses\ApiResponse; use App\Models\AnnualReportEntry; use Illuminate\Http\JsonResponse;
class AnnualReportEntryController extends Controller { public function index():JsonResponse{return ApiResponse::success(AnnualReportEntry::orderBy('category')->orderBy('item')->get());} public function export(){return response()->streamDownload(function(){$out=fopen('php://output','w');fputcsv($out,['Category','Item','Value','Period','Source']);foreach(AnnualReportEntry::orderBy('category')->get() as $x)fputcsv($out,[$x->category,$x->item,$x->value_text,$x->reporting_period,$x->data_source]);fclose($out);},'annual-report-summary.csv',['Content-Type'=>'text/csv; charset=UTF-8']);} }

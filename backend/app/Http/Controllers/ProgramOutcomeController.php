<?php

namespace App\Http\Controllers;

use App\Models\ProgramOutcome;
use Illuminate\Http\Request;
use App\Http\Responses\ApiResponse;

class ProgramOutcomeController extends Controller
{
    /**
     * Display a listing of the program outcomes.
     */
    public function index()
    {
        $plos = ProgramOutcome::where('is_active', true)
                ->orderBy('id')
                ->get();

        return ApiResponse::success($plos);
    }
}

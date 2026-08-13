<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
| CDMS is an API-only backend (ARCHITECTURE.md: React SPA -> REST API ->
| Laravel -> MySQL). This file intentionally carries no application pages —
| the frontend lives entirely in /frontend. A single informational route is
| kept so visiting the backend's root URL in a browser doesn't 404 with
| Laravel's default "welcome" scaffold page.
*/
Route::get('/', function () {
    return response()->json([
        'application' => config('app.name'),
        'message' => 'CDMS backend — API-only. See /api/v1/health.',
    ]);
});

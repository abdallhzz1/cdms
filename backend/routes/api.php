<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\HealthController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes — v1
|--------------------------------------------------------------------------
| Every CDMS endpoint lives under /api/v1/... (ARCHITECTURE.md: "REST API
| versioned as needed"). Phase 2 adds only the auth/authz foundation
| (login/logout/me); business routes (students, grades, distribution, ...)
| are added module-by-module in later phases per PROJECT_RULES.md's
| one-module-per-cycle rule — do not add placeholder routes for them here
| ahead of time.
*/
Route::prefix('v1')->name('api.v1.')->group(function () {
    Route::get('/health', HealthController::class)->name('health');

    Route::prefix('auth')->name('auth.')->group(function () {
        // Public: rate-limited so credential-stuffing can't be automated
        // against it (Prompt 02 §16).
        Route::post('/login', [AuthController::class, 'login'])
            ->middleware('throttle:login')
            ->name('login');

        // Protected: auth:sanctum authenticates via the first-party session
        // cookie (statefulApi(), bootstrap/app.php) — no bearer token.
        Route::middleware('auth:sanctum')->group(function () {
            Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
            Route::get('/me', [AuthController::class, 'me'])->name('me');
        });
    });
});

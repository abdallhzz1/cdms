<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class HealthController extends Controller
{
    /**
     * GET /api/v1/health
     *
     * Verifies (a) the application is running and (b) the *configured*
     * database connection (config/database.php `default`, i.e. MySQL in
     * every real environment) is actually reachable — not a hardcoded
     * assumption. Never returns "database: ok" unless a live query round
     * trip against it just succeeded (Prompt 01 §23).
     */
    public function __invoke(): JsonResponse
    {
        $database = $this->checkDatabase();

        $allHealthy = $database['status'] === 'ok';

        return ApiResponse::success(
            data: [
                'application' => 'ok',
                'database' => $database['status'],
            ],
            meta: [
                'checked_at' => now()->toIso8601String(),
            ],
            status: $allHealthy ? 200 : 503,
        );
    }

    /**
     * @return array{status: 'ok'|'unreachable'}
     */
    private function checkDatabase(): array
    {
        try {
            DB::connection()->getPdo();
            DB::connection()->select('select 1');

            return ['status' => 'ok'];
        } catch (Throwable $e) {
            // Log the real cause for operators; never surface it to the
            // client (no DSN, host, credentials, or driver error text in
            // the HTTP response — PROJECT_RULES.md §6).
            Log::channel(config('logging.default'))->error('Health check: database connection failed.', [
                'connection' => config('database.default'),
                'exception_class' => $e::class,
            ]);

            return ['status' => 'unreachable'];
        }
    }
}

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
        $queue = $this->checkQueue();
        $storage = $this->checkStorage();
        $failedJobsCount = $this->failedJobsCount();

        $allHealthy = $database['status'] === 'ok'
            && $queue === 'ok'
            && $storage === 'ok';

        return ApiResponse::success(
            data: [
                'application' => 'ok',
                'database' => $database['status'],
                'queue' => $queue,
                'storage' => $storage,
                'failed_jobs_count' => $failedJobsCount,
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

    private function checkQueue(): string
    {
        $connection = config('queue.default');
        $driver = config("queue.connections.{$connection}.driver");
        if ($driver === 'sync') {
            return 'ok';
        }

        if ($driver !== 'database') {
            return 'ok';
        }

        try {
            $table = config("queue.connections.{$connection}.table", 'jobs');
            $stalledBefore = now()->subMinutes(
                max((int) config('operations.health.stalled_job_minutes', 5), 1)
            )->timestamp;
            $hasStalledJob = DB::table($table)
                ->whereNull('reserved_at')
                ->where('available_at', '<=', $stalledBefore)
                ->exists();

            return $hasStalledJob ? 'stalled' : 'ok';
        } catch (Throwable $e) {
            Log::error('Health check: queue status unavailable.', ['exception_class' => $e::class]);
            return 'unreachable';
        }
    }

    private function checkStorage(): string
    {
        try {
            $path = storage_path('app');
            if (! is_dir($path) || ! is_writable($path)) {
                return 'unwritable';
            }

            $freeBytes = disk_free_space($path);
            $minimumBytes = max(
                (int) config('operations.health.minimum_free_storage_mb', 100),
                1
            ) * 1024 * 1024;

            return $freeBytes !== false && $freeBytes < $minimumBytes ? 'low_space' : 'ok';
        } catch (Throwable $e) {
            Log::error('Health check: storage status unavailable.', ['exception_class' => $e::class]);
            return 'unreachable';
        }
    }

    private function failedJobsCount(): int
    {
        try {
            return DB::table(config('queue.failed.table', 'failed_jobs'))->count();
        } catch (Throwable $e) {
            Log::error('Health check: failed jobs count unavailable.', ['exception_class' => $e::class]);
            return -1;
        }
    }
}

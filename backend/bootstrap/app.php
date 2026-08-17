<?php

use App\Http\Responses\ApiResponse;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Sanctum SPA cookie/session authentication (Prompt 02 §5): this
        // Laravel-provided helper prepends EnsureFrontendRequestsAreStateful
        // to the api/* group, which makes the frontend's own origin (from
        // config/sanctum.php's `stateful` list) authenticate via the normal
        // session cookie + CSRF check instead of a bearer token. Requests
        // from anywhere else are unaffected and still need a real Sanctum
        // token if a future phase ever issues one.
        $middleware->statefulApi();

        // CORS is handled by config/cors.php (framework HandleCors middleware, applied globally).
        $middleware->api(prepend: [
            \App\Http\Middleware\ForceJsonResponse::class,
        ]);

        $middleware->alias([
            'permission' => \App\Http\Middleware\EnsurePermission::class,
        ]);

        $middleware->trustProxies(at: '*');
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Centralised API exception handling: every error response — whatever
        // triggered it — goes out through the same success/error envelope
        // defined in App\Http\Responses\ApiResponse, and never leaks stack
        // traces, SQL, file paths, or environment values.
        $exceptions->shouldRenderJsonWhen(function (Request $request, Throwable $e) {
            return $request->is('api/*') || $request->expectsJson();
        });

        $exceptions->render(function (Throwable $e, Request $request) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null; // let Laravel's default (non-API) handling take over
            }

            return match (true) {
                $e instanceof ValidationException => tap(ApiResponse::error(
                    message: 'Validation Error: ' . collect($e->errors())->flatten()->first(),
                    errors: $e->errors(),
                    status: 422,
                ), function() use ($e) {
                    \Log::error('Validation Error: ' . json_encode($e->errors()));
                }),
                $e instanceof AuthenticationException => ApiResponse::error(
                    message: 'Unauthenticated.',
                    status: 401,
                ),
                $e instanceof ModelNotFoundException, $e instanceof NotFoundHttpException => ApiResponse::error(
                    message: 'The requested resource was not found.',
                    status: 404,
                ),
                $e instanceof HttpExceptionInterface => ApiResponse::error(
                    message: $e->getMessage() ?: 'Request could not be processed.',
                    status: $e->getStatusCode(),
                ),
                default => ApiResponse::error(
                    // Never expose the raw exception message/trace outside local/debug mode.
                    message: config('app.debug')
                        ? $e->getMessage()
                        : 'An unexpected error occurred. Please try again later.',
                    status: 500,
                ),
            };
        });
    })->create();

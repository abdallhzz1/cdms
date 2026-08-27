<?php

use App\Http\Responses\ApiResponse;
use Illuminate\Auth\Access\AuthorizationException;
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
            'permission.any' => \App\Http\Middleware\EnsureAnyPermission::class,
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

            $httpMessage = static fn (int $status): string => match ($status) {
                400 => 'تعذر معالجة الطلب. يرجى التحقق من البيانات والمحاولة مرة أخرى.',
                403 => 'لا تملك صلاحية تنفيذ هذا الإجراء.',
                405 => 'هذه العملية غير متاحة من خلال الرابط المستخدم.',
                409 => 'تعذر تنفيذ الطلب بسبب تعارض مع الحالة الحالية. حدّث الصفحة وحاول مجدداً.',
                419 => 'انتهت صلاحية الجلسة. حدّث الصفحة وحاول مرة أخرى.',
                429 => 'تم إرسال طلبات كثيرة خلال وقت قصير. انتظر قليلاً ثم حاول مرة أخرى.',
                503 => 'خدمة إرسال الرمز غير متاحة مؤقتاً. يرجى المحاولة لاحقاً.',
                default => 'تعذر معالجة الطلب. يرجى المحاولة مرة أخرى.',
            };

            return match (true) {
                $e instanceof ValidationException => ApiResponse::error(
                    message: (string) collect($e->errors())->flatten()->first(),
                    errors: $e->errors(),
                    status: 422,
                ),
                $e instanceof AuthenticationException => ApiResponse::error(
                    message: 'انتهت صلاحية الجلسة أو لم يتم التحقق من الهوية.',
                    status: 401,
                ),
                $e instanceof AuthorizationException => ApiResponse::error(
                    message: 'لا تملك صلاحية تنفيذ هذا الإجراء.',
                    status: 403,
                ),
                $e instanceof ModelNotFoundException, $e instanceof NotFoundHttpException => ApiResponse::error(
                    message: 'العنصر المطلوب غير موجود أو لم يعد متاحاً.',
                    status: 404,
                ),
                $e instanceof HttpExceptionInterface => ApiResponse::error(
                    message: $httpMessage($e->getStatusCode()),
                    status: $e->getStatusCode(),
                ),
                default => (function () use ($e, $request) {
                    $referenceId = (string) \Illuminate\Support\Str::uuid();
                    \Illuminate\Support\Facades\Log::error('Unhandled API exception', [
                        'reference_id' => $referenceId,
                        'exception' => $e,
                        'user_id' => $request->user()?->id,
                        'method' => $request->method(),
                        'path' => $request->path(),
                    ]);

                    return ApiResponse::error(
                        message: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى لاحقاً.',
                        meta: ['reference_id' => $referenceId],
                        status: 500,
                    );
                })(),
            };
        });
    })->create();

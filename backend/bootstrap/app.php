<?php

use App\Http\Middleware\EnsureAnyPermission;
use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\ForceJsonResponse;
use App\Http\Middleware\SetRequestLocale;
use App\Http\Responses\ApiResponse;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
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
            ForceJsonResponse::class,
            SetRequestLocale::class,
        ]);

        $middleware->alias([
            'permission' => EnsurePermission::class,
            'permission.any' => EnsureAnyPermission::class,
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

            $ar = app()->getLocale() === 'ar';
            $text = static fn (string $arabic, string $english): string => $ar ? $arabic : $english;
            $httpMessage = static fn (int $status): string => match ($status) {
                400 => $text('تعذر معالجة الطلب. يرجى التحقق من البيانات والمحاولة مرة أخرى.', 'The request could not be processed. Check the submitted data and try again.'),
                403 => $text('لا تملك صلاحية تنفيذ هذا الإجراء.', 'You do not have permission to perform this action.'),
                405 => $text('هذه العملية غير متاحة من خلال الرابط المستخدم.', 'This operation is not available through the requested endpoint.'),
                409 => $text('تعذر تنفيذ الطلب بسبب تعارض مع الحالة الحالية. حدّث الصفحة وحاول مجدداً.', 'The request conflicts with the current record state. Refresh the page and try again.'),
                419 => $text('انتهت صلاحية الجلسة. حدّث الصفحة وحاول مرة أخرى.', 'Your session has expired. Refresh the page and try again.'),
                429 => $text('تم إرسال طلبات كثيرة خلال وقت قصير. انتظر قليلاً ثم حاول مرة أخرى.', 'Too many requests were sent in a short time. Wait briefly and try again.'),
                503 => $text('الخدمة غير متاحة مؤقتاً. يرجى المحاولة لاحقاً.', 'The service is temporarily unavailable. Please try again later.'),
                default => $text('تعذر معالجة الطلب. يرجى المحاولة مرة أخرى.', 'The request could not be processed. Please try again.'),
            };

            return match (true) {
                $e instanceof ValidationException => ApiResponse::error(
                    message: (string) collect($e->errors())->flatten()->first(),
                    errors: $e->errors(),
                    status: 422,
                ),
                $e instanceof AuthenticationException => ApiResponse::error(
                    message: $text('انتهت صلاحية الجلسة أو لم يتم التحقق من الهوية.', 'Your session has expired or authentication could not be verified.'),
                    status: 401,
                ),
                $e instanceof AuthorizationException => ApiResponse::error(
                    message: $text('لا تملك صلاحية تنفيذ هذا الإجراء.', 'You do not have permission to perform this action.'),
                    status: 403,
                ),
                $e instanceof ModelNotFoundException, $e instanceof NotFoundHttpException => ApiResponse::error(
                    message: $text('العنصر المطلوب غير موجود أو لم يعد متاحاً.', 'The requested item was not found or is no longer available.'),
                    status: 404,
                ),
                $e instanceof HttpExceptionInterface => ApiResponse::error(
                    message: $httpMessage($e->getStatusCode()),
                    status: $e->getStatusCode(),
                ),
                default => (function () use ($e, $request, $text) {
                    $referenceId = (string) Str::uuid();
                    Log::error('Unhandled API exception', [
                        'reference_id' => $referenceId,
                        'exception' => $e,
                        'user_id' => $request->user()?->id,
                        'method' => $request->method(),
                        'path' => $request->path(),
                    ]);

                    return ApiResponse::error(
                        message: $text('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى لاحقاً.', 'An unexpected error occurred. Please try again later.'),
                        meta: ['reference_id' => $referenceId],
                        status: 500,
                    );
                })(),
            };
        });
    })->create();

<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SetRequestLocale
{
    public function handle(Request $request, Closure $next): Response
    {
        $requestedLocale = strtolower(substr((string) $request->header('Accept-Language'), 0, 2));

        // Long-running workers and the test process reuse the application
        // instance between requests. Always reset the locale so a request
        // without a language header cannot inherit the previous user's locale.
        app()->setLocale(in_array($requestedLocale, ['ar', 'en'], true)
            ? $requestedLocale
            : (string) config('app.locale', 'en'));

        return $next($request);
    }
}

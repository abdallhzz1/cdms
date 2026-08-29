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

        if (in_array($requestedLocale, ['ar', 'en'], true)) {
            app()->setLocale($requestedLocale);
        }

        return $next($request);
    }
}

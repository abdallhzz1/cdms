<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Every request under /api/* is treated as a JSON API request regardless of
 * the client's Accept header, so error rendering (bootstrap/app.php) and
 * validation responses are always the standard ApiResponse envelope rather
 * than an HTML error page.
 */
class ForceJsonResponse
{
    public function handle(Request $request, Closure $next): Response
    {
        $request->headers->set('Accept', 'application/json');

        return $next($request);
    }
}

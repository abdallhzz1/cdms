<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class ClinicalPortalPrivacy
{
    public function handle(Request $request, Closure $next)
    {
        // These cookies grant access to private grades. Enforce same-origin CSRF
        // independently of the configurable Sanctum stateful-domain list.
        if (! in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            $origin = $request->header('Origin');
            abort_unless(is_string($origin) && strcasecmp($origin, $request->getSchemeAndHttpHost()) === 0 && $request->header('X-Requested-With') === 'XMLHttpRequest', 403);
        }
        $response = $next($request);
        $response->headers->set('Cache-Control', 'no-store, private, max-age=0');
        $response->headers->set('Pragma', 'no-cache');
        $response->headers->set('Referrer-Policy', 'no-referrer');
        $response->headers->set('X-Robots-Tag', 'noindex, nofollow');

        return $response;
    }
}

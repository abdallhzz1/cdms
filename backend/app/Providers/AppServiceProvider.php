<?php

namespace App\Providers;

use App\Models\User;
use App\Models\Course;
use App\Observers\BusinessRecordAuditObserver;
use App\Services\AuthorizationService;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(AuthorizationService::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Course::observe(BusinessRecordAuditObserver::class);
        // The single Gate every permission check ultimately goes through —
        // EnsurePermission middleware and any future controller/policy code
        // call Gate::allows('permission', [$code]) rather than
        // re-implementing the role/permission/scope lookup themselves.
        Gate::define('permission', function (User $user, string $code, mixed $scopeContext = null) {
            return app(AuthorizationService::class)->can($user, $code, $scopeContext);
        });

        // Login rate limiting (Prompt 02 §16) — keyed by IP + attempted
        // email so a single attacker can't lock out a real user by hammering
        // their address from elsewhere, while still throttling any one
        // (ip, email) pair.
        RateLimiter::for('login', function (Request $request) {
            $key = strtolower((string) $request->input('email')).'|'.$request->ip();

            return Limit::perMinute(5)->by($key);
        });

        RateLimiter::for('operational-read', function (Request $request) {
            $key = $request->user()?->id
                ? 'user:'.$request->user()->id
                : 'ip:'.$request->ip();

            return Limit::perMinute(60)->by($key);
        });

        RateLimiter::for('export', function (Request $request) {
            $key = $request->user()?->id
                ? 'user:'.$request->user()->id
                : 'ip:'.$request->ip();

            return Limit::perMinute(15)->by($key);
        });

        RateLimiter::for('student-otp-request', fn (Request $request) => [
            Limit::perMinute(5)->by('otp-ip:'.$request->ip()),
            Limit::perHour(5)->by('otp-student:'.hash('sha256',(string)$request->input('university_number'))),
        ]);
        RateLimiter::for('student-otp-verify', fn (Request $request) => Limit::perMinute(10)->by('otp-verify:'.$request->ip()));
    }
}

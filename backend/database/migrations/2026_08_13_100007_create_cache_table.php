<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Laravel's standard database cache table. config/cache.php has defaulted
 * CACHE_STORE to "database" since Phase 1, but nothing exercised it until
 * now: the login rate limiter (RateLimiter::for('login', ...) in
 * AppServiceProvider, applied via `throttle:login` on POST /auth/login —
 * Prompt 02 §16) stores its hit counters in the configured cache store, so
 * the table needs to exist for that to work against MySQL.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cache', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->mediumText('value');
            $table->integer('expiration');
        });

        Schema::create('cache_locks', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->string('owner');
            $table->integer('expiration');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cache');
        Schema::dropIfExists('cache_locks');
    }
};

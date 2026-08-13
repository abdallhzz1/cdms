<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Laravel's standard database session table. Needed starting this phase
 * because authentication now genuinely uses sessions: Sanctum's SPA mode
 * authenticates the frontend via a first-party session cookie rather than
 * bearer tokens (config/sanctum.php, bootstrap/app.php's statefulApi()).
 * config/session.php already pointed SESSION_DRIVER at "database" since
 * Phase 1 (as a safe default), but no migration created the table until a
 * real session-backed flow existed to use it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
    }
};

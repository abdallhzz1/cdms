<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Minimal auth-only users table — Prompt 02 §6: id, name, email, password,
 * active-status, timestamps. No business/profile fields (job title,
 * department, phone, ...) are duplicated here; those will live on a
 * separate Staff/Profile table in a later phase and link back to this
 * table by user_id, per PROJECT_RULES.md's "enter once, reuse everywhere"
 * principle. No `remember_token` column: this application does not offer a
 * "remember me" flow, so the column would sit unused.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};

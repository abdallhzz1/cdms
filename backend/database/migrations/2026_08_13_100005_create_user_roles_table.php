<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * User <-> Role assignment. Plain many-to-many pivot — a user may hold more
 * than one role (e.g. a Department Head who is also a Clinical Supervisor),
 * which the approved documents describe in prose without forbidding.
 * Deliberately NOT a JSON column or comma-separated list on `users`
 * (Prompt 02 §8: "properly modeled, not JSON blobs").
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_roles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('role_id')->constrained('roles')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['user_id', 'role_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_roles');
    }
};

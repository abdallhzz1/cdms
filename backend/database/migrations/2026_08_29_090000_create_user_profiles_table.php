<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('full_name_en')->nullable();
            $table->string('phone')->nullable();
            $table->string('specialty')->nullable();
            $table->string('academic_degree')->nullable();
            $table->text('bio')->nullable();
            $table->longText('avatar_url')->nullable();
            $table->string('avatar_storage_path')->nullable();
            $table->timestamps();
        });

        // Preserve photos that were uploaded through the previous role-based
        // profile pages. From this point on UserProfile is the canonical
        // source, so a department head who is also a supervisor keeps one
        // identical picture in every directory and in the session header.
        foreach (['clinical_supervisor_profiles', 'department_head_profiles'] as $table) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            DB::table($table)
                ->whereNotNull('avatar_url')
                ->where('avatar_url', '!=', '')
                ->orderBy('id')
                ->each(function (object $legacy) {
                    DB::table('user_profiles')->updateOrInsert(
                        ['user_id' => $legacy->user_id],
                        [
                            'avatar_url' => $legacy->avatar_url,
                            'avatar_storage_path' => $legacy->avatar_storage_path ?? null,
                            'updated_at' => now(),
                            'created_at' => now(),
                        ]
                    );
                });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('user_profiles');
    }
};

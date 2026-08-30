<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $supervisorUserIds = DB::table('user_roles')
            ->join('roles', 'roles.id', '=', 'user_roles.role_id')
            ->where('roles.code', 'CLINICAL_SUPERVISOR')
            ->pluck('user_roles.user_id');

        DB::table('users')
            ->whereIn('id', $supervisorUserIds)
            ->orderBy('id')
            ->chunkById(200, function ($users): void {
                foreach ($users as $user) {
                    DB::table('people')->where('user_id', $user->id)->update([
                        'full_name_ar' => $user->name,
                        'email' => $user->email,
                        'updated_at' => now(),
                    ]);
                }
            });
    }

    public function down(): void
    {
        // This migration synchronizes duplicated identity data. Reverting the
        // schema must not restore stale names.
    }
};

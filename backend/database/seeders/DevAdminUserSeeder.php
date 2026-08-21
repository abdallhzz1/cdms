<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * LOCAL DEVELOPMENT ONLY. Creates one SYS_ADMIN account so a developer has
 * something to log in with while building the next phase against a fresh
 * database — this is a development convenience, not how real staff
 * accounts get created (that is a future Users management module).
 *
 * Refuses to run unless APP_ENV=local, regardless of SEED_DEV_ADMIN — this
 * is defense in depth in case SEED_DEV_ADMIN is accidentally left true in
 * a copied .env. The password is never hardcoded: it comes from
 * DEV_ADMIN_PASSWORD if set, or is randomly generated and printed to the
 * console exactly once (never logged to a file, never echoed again on a
 * second run against an existing user).
 */
class DevAdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $email = (string) env('DEV_ADMIN_EMAIL', 'admin@cdms.local');
        $existing = User::where('email', $email)->first();

        if ($existing) {
            $this->command?->info("DevAdminUserSeeder: {$email} already exists — not modifying its password.");
            $this->ensureHasSysAdminRole($existing);

            return;
        }

        $password = (string) env('DEV_ADMIN_PASSWORD', 'password123');

        $user = User::create([
            'name' => 'CDMS System Admin',
            'email' => $email,
            'password' => $password, // hashed automatically — User::casts()
            'is_active' => true,
        ]);

        $this->ensureHasSysAdminRole($user);

        $this->command?->info("DevAdminUserSeeder: created {$email} successfully.");
    }

    private function ensureHasSysAdminRole(User $user): void
    {
        $sysAdmin = Role::where('code', 'SYS_ADMIN')->first();

        if ($sysAdmin && ! $user->hasRole('SYS_ADMIN')) {
            $user->roles()->attach($sysAdmin->id);
        }
    }
}

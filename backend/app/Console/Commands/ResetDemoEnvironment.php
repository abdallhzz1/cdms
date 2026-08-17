<?php

namespace App\Console\Commands;

use Database\Seeders\DemoEnvironmentSeeder;
use Database\Seeders\Phase3PermissionSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;

class ResetDemoEnvironment extends Command
{
    protected $signature = 'cdms:demo-reset {--force : Run without the confirmation prompt}';
    protected $description = 'Rebuild the fictional CDMS demonstration environment (local only).';

    public function handle(): int
    {
        if (! app()->environment(['local', 'development', 'testing'])) {
            $this->error('cdms:demo-reset is disabled outside local/development/testing environments.');
            return self::FAILURE;
        }
        if ((string) env('DEV_ADMIN_PASSWORD', '') === '') {
            $this->error('DEV_ADMIN_PASSWORD must be set in the local backend .env before resetting demo data.');
            return self::FAILURE;
        }
        if (! $this->option('force') && ! $this->confirm('This deletes the local database and rebuilds only fictional demo data. Continue?')) {
            return self::SUCCESS;
        }

        Artisan::call('migrate:fresh', ['--force' => true]);
        foreach ([RoleSeeder::class, PermissionSeeder::class, RolePermissionSeeder::class, Phase3PermissionSeeder::class, DemoEnvironmentSeeder::class] as $seeder) {
            Artisan::call('db:seed', ['--class' => $seeder, '--force' => true]);
            $this->output->write(Artisan::output());
        }
        $this->info('Demo environment rebuilt: 216 students, 20 supervisors, 10 sites, and draft/current/superseded distributions.');
        return self::SUCCESS;
    }
}

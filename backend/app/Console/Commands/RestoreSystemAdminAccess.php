<?php

namespace App\Console\Commands;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Console\Command;

class RestoreSystemAdminAccess extends Command
{
    protected $signature = 'clinical:restore-system-admin {email}';
    protected $description = 'Restore the SYS_ADMIN role and global permissions for an existing local administrator.';

    public function handle(): int
    {
        $user = User::where('email', $this->argument('email'))->first();
        if (! $user) { $this->error('User not found.'); return self::FAILURE; }
        $role = Role::firstOrCreate(['code' => 'SYS_ADMIN'], ['name_key' => 'roles.sys_admin.name', 'description_key' => 'roles.sys_admin.description']);
        $role->permissions()->sync(Permission::pluck('id')->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all());
        $user->roles()->syncWithoutDetaching([$role->id]);
        $this->info('System administrator access restored.');
        return self::SUCCESS;
    }
}

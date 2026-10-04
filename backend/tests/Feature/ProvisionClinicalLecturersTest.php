<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Models\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProvisionClinicalLecturersTest extends TestCase
{
    use RefreshDatabase;

    private string $credentialsDirectory;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([
            \Database\Seeders\RoleSeeder::class,
            \Database\Seeders\BasicAttendancePermissionSeeder::class,
        ]);
        $this->credentialsDirectory = sys_get_temp_dir().DIRECTORY_SEPARATOR.'cdms-lecturer-test-'.bin2hex(random_bytes(8));
        mkdir($this->credentialsDirectory, 0700);
    }

    protected function tearDown(): void
    {
        foreach (glob($this->credentialsDirectory.DIRECTORY_SEPARATOR.'*.csv') ?: [] as $file) {
            unlink($file);
        }
        if (is_dir($this->credentialsDirectory)) {
            rmdir($this->credentialsDirectory);
        }
        parent::tearDown();
    }

    public function test_preview_does_not_create_accounts_or_credentials(): void
    {
        $this->artisan('clinical:provision-lecturers')
            ->expectsOutput('Preview only. No accounts, roles, passwords, or files were changed.')
            ->assertExitCode(0);

        $this->assertDatabaseCount('users', 0);
        $this->assertSame([], glob($this->credentialsDirectory.DIRECTORY_SEPARATOR.'*.csv'));
    }

    public function test_apply_creates_twenty_lecturer_only_accounts_and_is_idempotent(): void
    {
        $options = ['--apply' => true, '--credentials-dir' => $this->credentialsDirectory];
        $this->artisan('clinical:provision-lecturers', $options)->assertExitCode(0);

        $this->assertDatabaseCount('users', 20);
        $role = Role::where('code', 'BASIC_LECTURER')->firstOrFail();
        foreach (User::with('roles')->get() as $user) {
            $this->assertTrue($user->is_active);
            $this->assertSame(['BASIC_LECTURER'], $user->roles->pluck('code')->all());
            $this->assertDatabaseHas('user_roles', ['user_id' => $user->id, 'role_id' => $role->id, 'scope_type' => 'global']);
        }
        $this->assertDatabaseHas('users', ['email' => 'karimant@hebron.edu', 'name' => 'أ. كاريمان طيطي']);
        foreach (['abdallahq@hebron.edu', 'motazt@hebron.edu', 'alayasar@hebron.edu'] as $excluded) {
            $this->assertDatabaseMissing('users', ['email' => $excluded]);
        }

        $files = glob($this->credentialsDirectory.DIRECTORY_SEPARATOR.'*.csv') ?: [];
        $this->assertCount(1, $files);
        $this->assertCount(21, file($files[0]));
        $this->artisan('clinical:provision-lecturers', $options)->assertExitCode(0);
        $this->assertDatabaseCount('users', 20);
        $this->assertCount(1, glob($this->credentialsDirectory.DIRECTORY_SEPARATOR.'*.csv') ?: []);
    }

    public function test_existing_privileged_account_blocks_apply_without_changing_roles(): void
    {
        $existing = User::factory()->create(['email' => 'zughaierh@hebron.edu']);
        $admin = Role::where('code', 'SYS_ADMIN')->firstOrFail();
        $existing->roles()->attach($admin->id, ['scope_type' => 'global']);

        $this->artisan('clinical:provision-lecturers', [
            '--apply' => true,
            '--credentials-dir' => $this->credentialsDirectory,
        ])->assertExitCode(1);

        $this->assertDatabaseCount('users', 1);
        $this->assertSame(['SYS_ADMIN'], $existing->fresh()->roles->pluck('code')->all());
        $this->assertSame([], glob($this->credentialsDirectory.DIRECTORY_SEPARATOR.'*.csv'));
    }

    public function test_existing_lecturer_with_direct_permissions_requires_review(): void
    {
        $existing = User::factory()->create(['email' => 'zughaierh@hebron.edu']);
        $lecturer = Role::where('code', 'BASIC_LECTURER')->firstOrFail();
        $existing->roles()->attach($lecturer->id, ['scope_type' => 'global']);
        $extraPermission = Permission::where('code', 'basic_attendance.manage')->firstOrFail();
        $existing->directPermissions()->attach($extraPermission->id);

        $this->artisan('clinical:provision-lecturers', [
            '--apply' => true,
            '--credentials-dir' => $this->credentialsDirectory,
        ])->assertExitCode(1);

        $this->assertDatabaseCount('users', 1);
        $this->assertSame(['BASIC_LECTURER'], $existing->fresh()->roles->pluck('code')->all());
        $this->assertDatabaseHas('user_permission_grants', ['user_id' => $existing->id, 'permission_id' => $extraPermission->id]);
        $this->assertSame([], glob($this->credentialsDirectory.DIRECTORY_SEPARATOR.'*.csv'));
    }

    public function test_explicit_skip_creates_only_missing_accounts_and_preserves_existing_roles(): void
    {
        $existingLecturer = User::factory()->create(['email' => 'zughaierh@hebron.edu']);
        $lecturer = Role::where('code', 'BASIC_LECTURER')->firstOrFail();
        $existingLecturer->roles()->attach($lecturer->id, ['scope_type' => 'global']);
        $existingAdmin = User::factory()->create(['email' => 'hasasneha@hebron.edu', 'name' => 'علاء حساسنة']);
        $admin = Role::where('code', 'BASIC_ATTENDANCE_ADMIN')->firstOrFail();
        $existingAdmin->roles()->attach($admin->id, ['scope_type' => 'global']);

        $options = [
            '--apply' => true,
            '--skip-conflicts' => true,
            '--credentials-dir' => $this->credentialsDirectory,
        ];
        $this->artisan('clinical:provision-lecturers', $options)->assertExitCode(0);

        $this->assertDatabaseCount('users', 20);
        $this->assertSame(['BASIC_LECTURER'], $existingLecturer->fresh()->roles->pluck('code')->all());
        $this->assertSame(['BASIC_ATTENDANCE_ADMIN'], $existingAdmin->fresh()->roles->pluck('code')->all());
        $this->assertSame('علاء حساسنة', $existingAdmin->fresh()->name);
        $files = glob($this->credentialsDirectory.DIRECTORY_SEPARATOR.'*.csv') ?: [];
        $this->assertCount(1, $files);
        $this->assertCount(19, file($files[0]));
        $this->artisan('clinical:provision-lecturers', $options)->assertExitCode(0);
        $this->assertDatabaseCount('users', 20);
        $this->assertCount(1, glob($this->credentialsDirectory.DIRECTORY_SEPARATOR.'*.csv') ?: []);
    }
}

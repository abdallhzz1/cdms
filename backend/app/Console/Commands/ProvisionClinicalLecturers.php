<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/** Provision the photographed lecturer list with the isolated lecture role only. */
class ProvisionClinicalLecturers extends Command
{
    protected $signature = 'clinical:provision-lecturers
        {--apply : Create missing accounts (the default only previews changes)}
        {--skip-conflicts : With --apply, leave existing conflicting accounts untouched and create only missing accounts}
        {--credentials-dir= : Existing private directory for the one-time credentials CSV (defaults to the shell user home)}';

    protected $description = 'Preview or create lecturer-only accounts from the approved October 2026 clinical lecturer list.';

    private const ROLE = 'BASIC_LECTURER';

    private const ROLE_PERMISSIONS = [
        'basic_attendance.export',
        'basic_attendance.record',
        'basic_attendance.view',
    ];

    /** These three people were explicitly excluded; a manifest edit cannot provision them. */
    private const EXCLUDED_EMAILS = [
        'abdallahq@hebron.edu',
        'motazt@hebron.edu',
        'alayasar@hebron.edu',
    ];

    public function handle(): int
    {
        try {
            $lecturers = $this->readManifest();
        } catch (\Throwable $e) {
            $this->error($e->getMessage());
            return self::FAILURE;
        }

        $role = Role::query()->with('permissions')->where('code', self::ROLE)->first();
        if (! $role) {
            $this->error('BASIC_LECTURER is missing. Set up the basic attendance role before provisioning accounts.');
            return self::FAILURE;
        }
        $actualPermissions = $role->permissions->pluck('code')->sort()->values()->all();
        if ($actualPermissions !== self::ROLE_PERMISSIONS) {
            $this->error('BASIC_LECTURER has unexpected permissions. Review the permission matrix before creating lecturer-only accounts.');
            return self::FAILURE;
        }

        $new = [];
        $conflicts = 0;
        $existingCount = 0;
        $preview = [];
        foreach ($lecturers as $lecturer) {
            $existing = User::query()->with(['roles', 'directPermissions'])->whereRaw('LOWER(email) = ?', [$lecturer['email']])->first();
            if (! $existing) {
                $status = 'CREATE';
                $new[] = $lecturer;
            } elseif ($existing->is_active && $existing->roles->pluck('code')->all() === [self::ROLE] && $existing->directPermissions->isEmpty()) {
                $status = 'EXISTS — lecturer only';
                $existingCount++;
            } else {
                $status = 'REVIEW — existing account/roles unchanged';
                $conflicts++;
            }
            $preview[] = [$lecturer['name_ar'], $lecturer['email'], $status];
        }

        $this->table(['Name', 'University email', 'Action'], $preview);
        $this->line(sprintf('New: %d | Already lecturer-only: %d | Requires review: %d | Explicitly excluded: 3 | Duplicate source row removed: 1', count($new), $existingCount, $conflicts));

        if (! $this->option('apply')) {
            $this->info('Preview only. No accounts, roles, passwords, or files were changed.');
            return self::SUCCESS;
        }
        if ($conflicts > 0 && ! $this->option('skip-conflicts')) {
            $this->error('No accounts were created. Resolve existing-account conflicts individually, then run the command again.');
            return self::FAILURE;
        }
        if ($conflicts > 0) {
            $this->warn($conflicts.' existing conflicting account(s) will be skipped unchanged. Review the table above before proceeding.');
        }
        if ($new === []) {
            $this->info('Nothing to create. Existing accounts were not changed.');
            return self::SUCCESS;
        }

        try {
            $directory = $this->privateCredentialsDirectory();
        } catch (\Throwable $e) {
            $this->error($e->getMessage());
            return self::FAILURE;
        }

        $credentialsPath = null;
        try {
            DB::transaction(function () use ($new, $role, $directory, &$credentialsPath): void {
                $credentials = [];
                foreach ($new as $lecturer) {
                    // A password is never shared between lecturers or written to logs/Git.
                    $password = bin2hex(random_bytes(24)).'Aa1!';
                    $user = User::create([
                        'name' => $lecturer['name_ar'],
                        'email' => $lecturer['email'],
                        'password' => Hash::make($password),
                        'is_active' => true,
                    ]);
                    $user->roles()->attach($role->id, ['scope_type' => 'global', 'scope_id' => null]);
                    AuditLog::create([
                        'user_id' => null,
                        'action' => 'clinical_lecturer.provisioned',
                        'entity_type' => User::class,
                        'entity_id' => $user->id,
                        'changes' => ['email' => $user->email, 'role' => self::ROLE],
                    ]);
                    $credentials[] = [$user->name, $user->email, $password];
                }
                $credentialsPath = $this->writeCredentials($directory, $credentials);
            });
        } catch (\Throwable $e) {
            if ($credentialsPath && is_file($credentialsPath)) {
                @unlink($credentialsPath);
            }
            $this->error('Provisioning failed; the database transaction was rolled back. '.$e->getMessage());
            return self::FAILURE;
        }

        $this->info(count($new).' lecturer-only accounts created.');
        $this->warn('One-time credentials: '.$credentialsPath);
        $this->warn('Keep this file outside the web root; distribute passwords privately and delete the file after handoff.');
        $this->line('Section assignments are separate and were not changed.');
        return self::SUCCESS;
    }

    /** @return list<array{name_ar:string,email:string}> */
    private function readManifest(): array
    {
        $path = base_path('resources/imports/clinical_lecturers_2026_10.csv');
        $stream = @fopen($path, 'rb');
        if (! $stream) {
            throw new \RuntimeException('Lecturer manifest not found: '.$path);
        }

        try {
            if (fgetcsv($stream, 0, ',', '"', '') !== ['name_ar', 'email']) {
                throw new \RuntimeException('Lecturer manifest must have name_ar,email headers.');
            }
            $rows = [];
            $seen = [];
            while (($cells = fgetcsv($stream, 0, ',', '"', '')) !== false) {
                if (count($cells) !== 2) {
                    throw new \RuntimeException('A lecturer manifest row has the wrong number of columns.');
                }
                $name = trim($cells[0]);
                $email = mb_strtolower(trim($cells[1]));
                if ($name === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL) || ! str_ends_with($email, '@hebron.edu')) {
                    throw new \RuntimeException('The lecturer manifest contains a missing name or invalid university email.');
                }
                if (in_array($email, self::EXCLUDED_EMAILS, true)) {
                    throw new \RuntimeException('The manifest contains an explicitly excluded lecturer: '.$email);
                }
                if (isset($seen[$email])) {
                    throw new \RuntimeException('Duplicate lecturer email in manifest: '.$email);
                }
                $seen[$email] = true;
                $rows[] = ['name_ar' => $name, 'email' => $email];
            }
            if (count($rows) !== 20) {
                throw new \RuntimeException('Expected 20 distinct eligible lecturers; found '.count($rows).'. Review the manifest before provisioning.');
            }
            return $rows;
        } finally {
            fclose($stream);
        }
    }

    private function privateCredentialsDirectory(): string
    {
        $requested = $this->option('credentials-dir') ?: getenv('HOME');
        $directory = $requested ? realpath($requested) : false;
        if (! $directory || ! is_dir($directory) || ! is_writable($directory)) {
            throw new \RuntimeException('Specify an existing writable private --credentials-dir outside the site and repository.');
        }
        if (dirname($directory) === $directory) {
            throw new \RuntimeException('The filesystem root is not a safe credentials directory.');
        }
        $normalized = str_replace('\\', '/', rtrim($directory, '/\\'));
        foreach ([base_path(), dirname(base_path()), public_path()] as $protectedPath) {
            $protected = realpath($protectedPath);
            if (! $protected) {
                continue;
            }
            $protected = str_replace('\\', '/', rtrim($protected, '/\\'));
            if (strcasecmp($normalized, $protected) === 0 || str_starts_with(strtolower($normalized), strtolower($protected).'/')) {
                throw new \RuntimeException('Credential files must not be written inside the repository or web document root.');
            }
        }
        return $directory;
    }

    /** @param list<array{string,string,string}> $credentials */
    private function writeCredentials(string $directory, array $credentials): string
    {
        $path = $directory.DIRECTORY_SEPARATOR.'clinical-lecturer-credentials-'.now()->format('Ymd-His').'-'.bin2hex(random_bytes(4)).'.csv';
        $previousUmask = umask(0077);
        try {
            $stream = @fopen($path, 'x');
        } finally {
            umask($previousUmask);
        }
        if (! $stream) {
            throw new \RuntimeException('Could not create the private credentials file.');
        }

        try {
            if (fputcsv($stream, ['name_ar', 'email', 'temporary_password'], ',', '"', '') === false) {
                throw new \RuntimeException('Could not write the credentials header.');
            }
            foreach ($credentials as $row) {
                if (fputcsv($stream, $row, ',', '"', '') === false) {
                    throw new \RuntimeException('Could not write lecturer credentials.');
                }
            }
        } catch (\Throwable $e) {
            fclose($stream);
            @unlink($path);
            throw $e;
        }
        if (! fclose($stream)) {
            @unlink($path);
            throw new \RuntimeException('Could not finish the credentials file.');
        }
        if (DIRECTORY_SEPARATOR === '/' && ! chmod($path, 0600)) {
            @unlink($path);
            throw new \RuntimeException('Could not restrict credentials file permissions.');
        }
        return $path;
    }
}

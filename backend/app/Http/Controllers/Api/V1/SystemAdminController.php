<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\User;
use App\Models\Role;
use App\Models\Permission;
use App\Models\AuditLog;
use App\Services\SecurityAuditService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

class SystemAdminController extends Controller
{
    public function __construct(private readonly SecurityAuditService $audit) {}

    /**
     * System Health & Server Monitoring Data
     */
    public function health()
    {
        $start = microtime(true);
        try {
            DB::connection()->getPdo();
            $dbStatus = 'healthy';
            $dbLatencyMs = round((microtime(true) - $start) * 1000, 2);
        } catch (\Exception $e) {
            $dbStatus = 'unhealthy';
            $dbLatencyMs = 0;
        }

        $activeUsersCount = User::where('is_active', true)->count();
        $totalUsersCount = User::count();
        $totalRolesCount = Role::count();
        $auditLogsCount = AuditLog::count();

        // Disk usage estimation
        $freeSpaceGB = round(disk_free_space(base_path()) / (1024 * 1024 * 1024), 2);
        $totalSpaceGB = round(disk_total_space(base_path()) / (1024 * 1024 * 1024), 2);
        $usedSpaceGB = round($totalSpaceGB - $freeSpaceGB, 2);
        $diskUsedPercent = $totalSpaceGB > 0 ? round(($usedSpaceGB / $totalSpaceGB) * 100, 1) : 0;

        return ApiResponse::success([
            'environment' => config('app.env'),
            'debug_mode' => config('app.debug'),
            'php_version' => PHP_VERSION,
            'laravel_version' => app()->version(),
            'database' => [
                'status' => $dbStatus,
                'latency_ms' => $dbLatencyMs,
                'connection' => config('database.default'),
            ],
            'storage' => [
                'total_gb' => $totalSpaceGB,
                'used_gb' => $usedSpaceGB,
                'free_gb' => $freeSpaceGB,
                'used_percent' => $diskUsedPercent,
            ],
            'metrics' => [
                'active_users' => $activeUsersCount,
                'total_users' => $totalUsersCount,
                'roles_count' => $totalRolesCount,
                'audit_logs_count' => $auditLogsCount,
            ],
            'server_time' => now()->toIso8601String(),
        ]);
    }

    /**
     * List Active Sessions
     */
    public function sessions(Request $request)
    {
        $cutoff = now()->subMinutes((int) config('session.lifetime'))->timestamp;
        $currentSessionId = $request->hasSession() ? $request->session()->getId() : null;
        $rows = DB::table(config('session.table', 'sessions'))
            ->whereNotNull('user_id')
            ->where('last_activity', '>=', $cutoff)
            ->orderByDesc('last_activity')
            ->limit(100)
            ->get();
        $users = User::with('roles')->whereIn('id', $rows->pluck('user_id')->unique())->get()->keyBy('id');

        $sessions = $rows->map(function ($session) use ($users, $currentSessionId) {
            $user = $users->get($session->user_id);
            if (!$user) return null;

            return [
                'id' => $session->id,
                'user_id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'roles' => $user->roles->pluck('code')->values(),
                'ip_address' => $session->ip_address,
                'user_agent' => $session->user_agent,
                'is_current' => hash_equals((string) $currentSessionId, (string) $session->id),
                'last_activity' => \Carbon\Carbon::createFromTimestamp($session->last_activity)->toIso8601String(),
            ];
        })->filter()->values();

        return ApiResponse::success([
            'total_active' => $sessions->count(),
            'sessions' => $sessions,
        ]);
    }

    /**
     * Force Revoke / Logout User Session
     */
    public function revokeSession(Request $request, $userId)
    {
        $user = User::findOrFail($userId);

        // Disallow revoking own current admin session
        if ($user->id === $request->user()->id) {
            return ApiResponse::error('لا يمكنك إلغاء جلسة حسابك الحالي أثناء الاستخدام.', [], [], 422);
        }

        DB::table(config('session.table', 'sessions'))
            ->where('user_id', $user->id)
            ->delete();

        $this->audit->record('user.sessions_revoked', User::class, $user->id);

        return ApiResponse::success(null, 'تم إلغاء جميع جلسات الحساب بنجاح.');
    }

    /**
     * Permission Matrix Data (Roles vs Permissions)
     */
    public function permissionMatrix()
    {
        $roles = Role::with('permissions:id,code')->get(['id', 'code', 'name_key']);
        $permissions = Permission::all(['id', 'code', 'module', 'action']);

        $matrix = $roles->map(function ($role) use ($permissions) {
            $rolePermIds = $role->permissions->pluck('id')->toArray();
            return [
                'role_id' => $role->id,
                'role_code' => $role->code,
                'role_name' => $role->code,
                'permissions' => $permissions->map(function ($p) use ($rolePermIds) {
                    return [
                        'permission_id' => $p->id,
                        'code' => $p->code,
                        'name' => $p->code,
                        'module' => $p->module,
                        'granted' => in_array($p->id, $rolePermIds),
                    ];
                }),
            ];
        });

        return ApiResponse::success([
            'roles' => $roles->map(fn($r) => ['id' => $r->id, 'code' => $r->code, 'name' => $r->code]),
            'permissions' => $permissions,
            'matrix' => $matrix,
        ]);
    }

    /**
     * Toggle Permission for Role
     */
    public function togglePermission(Request $request)
    {
        $request->validate([
            'role_id' => 'required|exists:roles,id',
            'permission_id' => 'required|exists:permissions,id',
        ]);

        $role = Role::findOrFail($request->role_id);
        $permId = $request->permission_id;



        if ($role->permissions()->where('permissions.id', $permId)->exists()) {
            $role->permissions()->detach($permId);
            $granted = false;
        } else {
            $role->permissions()->attach($permId, ['scope_type' => 'global']);
            $granted = true;
        }

        $this->audit->record('role.permission_changed', Role::class, $role->id, [
            'permission_id' => (int) $permId,
            'granted' => $granted,
        ]);

        return ApiResponse::success([
            'role_id' => $role->id,
            'permission_id' => $permId,
            'granted' => $granted,
        ], 'تم تحديث مصفوفة الصلاحيات بنجاح.');
    }

    /**
     * System Settings & Configuration Data
     */
    public function getSettings()
    {
        $settings = Cache::get('system_settings', [
            'institution_name' => 'جامعة الخليل - كلية الطب والعلوم الصحية',
            'system_title' => 'نظام إدارة الدائرة السريرية (CDMS)',
            'contact_email' => 'admin1@hebron.edu',
            'maintenance_mode' => false,
            'auto_backup_enabled' => true,
            'backup_frequency' => 'daily',
            'session_timeout_minutes' => 120,
            'max_login_attempts' => 5,
        ]);

        return ApiResponse::success($settings);
    }

    /**
     * Update System Settings
     */
    public function updateSettings(Request $request)
    {
        $request->validate([
            'institution_name' => 'required|string|max:255',
            'system_title' => 'required|string|max:255',
            'contact_email' => 'required|email|max:255',
            'maintenance_mode' => 'required|boolean',
            'auto_backup_enabled' => 'required|boolean',
            'backup_frequency' => 'required|string',
            'session_timeout_minutes' => 'required|integer|min:15|max:1440',
        ]);

        $settings = $request->only([
            'institution_name',
            'system_title',
            'contact_email',
            'maintenance_mode',
            'auto_backup_enabled',
            'backup_frequency',
            'session_timeout_minutes',
            'max_login_attempts',
        ]);

        Cache::forever('system_settings', $settings);

        $this->audit->record('system.settings_updated', self::class, 1, [
            'changed_keys' => array_keys($settings),
        ]);

        return ApiResponse::success($settings, 'تم حفظ إعدادات النظام وتحديث التخزين السريع بنجاح.');
    }
}

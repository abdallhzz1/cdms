<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\HasSafePagination;
use App\Models\User;
use App\Models\Role;
use App\Models\ClinicalSupervisorProfile;
use App\Models\Person;
use App\Models\Course;
use App\Models\Student;
use App\Services\SecurityAuditService;
use App\Services\CorrespondenceRecipientService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Support\Facades\DB;
use App\Http\Responses\ApiResponse;

class UserController extends Controller
{
    use HasSafePagination;

    public function __construct(
        private readonly SecurityAuditService $audit,
        private readonly CorrespondenceRecipientService $correspondenceRecipients,
    ) {}

    /**
     * User Lookup for Dropdowns
     */
    public function lookup(Request $request)
    {
        $users = User::where('is_active', true)
            ->whereHas('roles', function ($q) {
                $q->whereIn('code', [
                    'SYS_ADMIN', 'CLINICAL_DIRECTOR', 'DEAN', 'VICE_DEAN',
                    'DEPARTMENT_HEAD', 'ADMIN_ASSISTANT', 'RTA',
                    'CLINICAL_SUPERVISOR', 'ACADEMIC_ADVISOR', 'QUALITY',
                ]);
            })
            ->with('roles')
            ->orderBy('name')
            ->get();

        if ($request->query('purpose') === 'correspondence') {
            $sender = $request->user()->loadMissing('roles');
            $users = $users
                ->filter(fn (User $recipient) => $this->correspondenceRecipients->canSend($sender, $recipient))
                ->values();
        }

        $result = $users->map(function ($u) {
            return [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'roles' => $u->roles->map(fn($r) => [
                    'id' => $r->id,
                    'code' => $r->code,
                    'name_key' => $r->name_key
                ]),
            ];
        });

        return ApiResponse::success($result);
    }

    /**
     * GET /api/v1/users
     */
    public function index(Request $request)
    {
        $query = User::with(['roles' => function ($q) {
            $q->withPivot('scope_type', 'scope_id');
        }]);

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $users = $query->orderBy('id', 'desc')->paginate($this->perPage($request, 100, 500));

        // Enrich each user with their current department_id
        $items = collect($users->items())->map(function ($user) {
            $scopedRole = $user->roles->first(function ($role) {
                return in_array($role->code, ['DEPARTMENT_HEAD', 'RTA'])
                    && $role->pivot->scope_type === 'department'
                    && !is_null($role->pivot->scope_id);
            });
            $user->department_id = $scopedRole ? (int) $scopedRole->pivot->scope_id : null;
            return $user;
        });

        return ApiResponse::success([
            'items' => $items,
            'total' => $users->total(),
            'last_page' => $users->lastPage(),
        ]);
    }

    /**
     * POST /api/v1/users
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name'          => 'required|string|max:255',
            'email'         => 'required|email|unique:users,email',
            'password'      => ['required', 'string', Password::min(12)->mixedCase()->numbers()->symbols()],
            'roles'         => 'required|array|min:1',
            'roles.*'       => 'exists:roles,code',
            'is_active'     => 'boolean',
            'department_id' => 'nullable|integer|exists:departments,id',
        ]);

        $this->validateScopedRoles($validated['roles'], $validated['department_id'] ?? null);

        $user = DB::transaction(function () use ($validated) {
            $user = User::create([
                'name'      => $validated['name'],
                'email'     => $validated['email'],
                'password'  => Hash::make($validated['password']),
                'is_active' => $validated['is_active'] ?? true,
            ]);
            $this->syncRolesWithScope($user, $validated['roles'], $validated['department_id'] ?? null);
            return $user;
        });

        $this->audit->record('user.created', User::class, $user->id, [
            'roles' => $validated['roles'] ?? [],
            'is_active' => $user->is_active,
        ]);

        return ApiResponse::success($user->load('roles'), 'تم إنشاء الحساب بنجاح.');
    }

    /**
     * PUT /api/v1/users/{user}
     */
    public function update(Request $request, User $user)
    {
        $before = [
            'name' => $user->name,
            'email' => $user->email,
            'is_active' => $user->is_active,
            'roles' => $user->roles()->pluck('code')->all(),
        ];
        $validated = $request->validate([
            'name'          => 'required|string|max:255',
            'email'         => ['required', 'email', Rule::unique('users')->ignore($user->id)],
            'roles'         => 'required|array|min:1',
            'roles.*'       => 'exists:roles,code',
            'is_active'     => 'boolean',
            'department_id' => 'nullable|integer|exists:departments,id',
        ]);

        $this->validateScopedRoles($validated['roles'], $validated['department_id'] ?? null);

        DB::transaction(function () use ($user, $validated) {
            $user->update([
                'name'      => $validated['name'],
                'email'     => $validated['email'],
                'is_active' => $validated['is_active'] ?? $user->is_active,
            ]);
            $this->syncRolesWithScope($user, $validated['roles'], $validated['department_id'] ?? null);
        });

        $this->audit->record('user.updated', User::class, $user->id, [
            'before' => $before,
            'after' => [
                'name' => $user->name,
                'email' => $user->email,
                'is_active' => $user->is_active,
                'roles' => $user->roles()->pluck('code')->all(),
            ],
        ]);

        return ApiResponse::success(
            $user->load('roles'),
            'تم تحديث بيانات الحساب بنجاح.'
        );
    }

    /**
     * Sync roles with department scope for DEPARTMENT_HEAD and RTA.
     * For scoped roles (DEPARTMENT_HEAD / RTA) we store scope_type='department' + scope_id.
     * For all other roles we store scope_type='global' + scope_id=null.
     */
    private function syncRolesWithScope(User $user, array $roleCodes, ?int $departmentId): void
    {
        $scopedRoles = ['DEPARTMENT_HEAD', 'RTA'];

        $syncData = [];
        foreach ($roleCodes as $code) {
            $role = Role::where('code', $code)->first();
            if (!$role) continue;

            if (in_array($code, $scopedRoles) && $departmentId) {
                $syncData[$role->id] = [
                    'scope_type' => 'department',
                    'scope_id'   => $departmentId,
                ];
            } else {
                $syncData[$role->id] = [
                    'scope_type' => 'global',
                    'scope_id'   => null,
                ];
            }
        }

        $user->roles()->sync($syncData);

        if (in_array('CLINICAL_SUPERVISOR', $roleCodes, true)) {
            $this->ensureClinicalSupervisorIdentity($user, $departmentId);
        }
    }

    private function validateScopedRoles(array $roleCodes, ?int $departmentId): void
    {
        if (array_intersect(['DEPARTMENT_HEAD', 'RTA'], $roleCodes) && ! $departmentId) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'department_id' => ['A department is required for the Department Head or RTA role.'],
            ]);
        }
    }

    /**
     * A user who receives the clinical-supervisor role must have one stable
     * Person identity. This keeps multi-role accounts (for example a head who
     * also supervises students) linked to the same assignments and profile.
     */
    private function ensureClinicalSupervisorIdentity(User $user, ?int $departmentId): void
    {
        $person = Person::query()->where('user_id', $user->id)->first();

        if (! $person) {
            $person = Person::query()->where('email', $user->email)->whereNull('user_id')->first();
        }

        if ($person) {
            $person->update([
                'user_id' => $user->id,
                'email' => $user->email,
                'department_id' => $departmentId ?: $person->department_id,
                'is_active' => true,
            ]);
        } else {
            Person::create([
                'user_id' => $user->id,
                'full_name_ar' => $user->name,
                'full_name_en' => $user->name,
                'email' => $user->email,
                'department_id' => $departmentId,
                'is_active' => true,
            ]);
        }

        $profile = ClinicalSupervisorProfile::firstOrCreate(['user_id' => $user->id]);
        if ($departmentId && ! $profile->department_id) {
            $profile->update(['department_id' => $departmentId]);
        }
    }

    /**
     * DELETE /api/v1/users/{user}
     */
    public function destroy(User $user)
    {
        // Safety Protection: Cannot delete logged in user or primary admin
        if (auth()->id() === $user->id) {
            return ApiResponse::error('لا يمكن حذف حسابك الشخصي المتصل حالياً.', [], [], 422);
        }

        if ($user->email === 'admin1@hebron.edu') {
            return ApiResponse::error('لا يمكن حذف حساب مدير النظام الرئيسي (admin1@hebron.edu).', [], [], 422);
        }

        $userId = $user->id;
        $roles = $user->roles()->pluck('code')->all();
        $user->roles()->detach();
        $user->delete();
        $this->audit->record('user.deleted', User::class, $userId, ['roles' => $roles]);

        return ApiResponse::success(null, 'تم حذف الحساب نهائياً من النظام بنجاح.');
    }

    /**
     * POST /api/v1/users/{user}/reset-password
     */
    public function resetPassword(Request $request, User $user)
    {
        $validated = $request->validate([
            'password' => ['required', 'string', Password::min(12)->mixedCase()->numbers()->symbols()],
        ]);

        $user->update([
            'password' => Hash::make($validated['password']),
        ]);

        \DB::table(config('session.table', 'sessions'))->where('user_id', $user->id)->delete();
        $this->audit->record('user.password_reset', User::class, $user->id);

        return ApiResponse::success(null, 'تم تعيين كلمة المرور الجديدة للحساب بنجاح.');
    }

    /**
     * POST /api/v1/users/{user}/toggle
     */
    public function toggleActive(User $user)
    {
        if (auth()->id() === $user->id) {
            return ApiResponse::error('لا يمكن تجميد حسابك الشخصي المتصل حالياً.', [], [], 422);
        }

        $user->is_active = !$user->is_active;
        $user->save();

        if (!$user->is_active) {
            \DB::table(config('session.table', 'sessions'))->where('user_id', $user->id)->delete();
        }

        $this->audit->record('user.status_changed', User::class, $user->id, [
            'is_active' => $user->is_active,
        ]);

        $status = $user->is_active ? 'تفعيل' : 'تجميد';
        return ApiResponse::success($user, "تم {$status} الحساب بنجاح.");
    }

    /**
     * GET /api/v1/users/roles
     */
    public function getRoles()
    {
        return ApiResponse::success(Role::all(['id', 'code', 'name_key']));
    }

    /**
     * Departments available while assigning scoped user roles.
     */
    public function departmentsForAssignment()
    {
        $departments = DB::table('departments')
            ->where('is_active', true)
            ->orderBy('name_ar')
            ->get(['id', 'name_ar', 'name_en', 'code', 'dept_type']);

        return ApiResponse::success($departments);
    }

    /**
     * PUT /api/v1/users/{user}/assign-levels
     */
    public function assignLevels(Request $request, User $user)
    {
        if (! $user->hasRole('RTA')) {
            return ApiResponse::error('This user does not have the RTA role.', [], [], 422);
        }
        $validated = $request->validate([
            'assigned_levels' => 'nullable|array',
            'assigned_levels.*' => 'string|in:fourth,fifth,sixth',
        ]);

        $user->assigned_levels = !empty($validated['assigned_levels']) ? $validated['assigned_levels'] : null;
        $user->save();
        $this->audit->record('rta.cohorts_assigned', User::class, $user->id, [
            'assigned_levels' => $user->assigned_levels ?? [],
        ]);

        return ApiResponse::success(
            $user->only(['id', 'name', 'email', 'assigned_levels']),
            'تم تحديث الدفعات المخصصة بنجاح.'
        );
    }

    /**
     * GET /api/v1/users/rta-list
     */
    public function rtaList()
    {
        $users = User::with('roles')
            ->whereHas('roles', fn($q) => $q->where('code', 'RTA'))
            ->get(['id', 'name', 'email', 'assigned_levels', 'is_active']);

        return ApiResponse::success($users->map(function ($u) {
            $levels = $u->assigned_levels ?? [];
            return [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'assigned_levels' => $u->assigned_levels,
                'is_active' => $u->is_active,
                'roles' => $u->roles->pluck('code'),
                'student_count' => empty($levels) ? 0 : Student::whereIn('academic_level', $levels)->whereIn('registration_status', ['active', 'registered'])->count(),
                'course_count' => empty($levels) ? 0 : Course::whereIn('academic_level', $levels)->where('is_active', true)->count(),
            ];
        }));
    }
}

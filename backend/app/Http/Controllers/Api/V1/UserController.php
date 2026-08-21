<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Role;
use App\Models\Person;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function lookup(Request $request)
    {
        $users = User::where('is_active', true)
            ->whereHas('roles', function ($q) {
                $q->whereIn('code', [
                    'DEPARTMENT_HEAD', 
                    'RTA', 
                    'CLINICAL_SUPERVISOR', 
                    'ACADEMIC_ADVISOR', 
                    'CLINICAL_DIRECTOR', 
                    'DEAN', 
                    'VICE_DEAN'
                ]);
            })
            ->with(['roles', 'person:id,user_id'])
            ->orderBy('name')
            ->get();

        $result = $users->map(function ($u) {
            return [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'person_id' => $u->person?->id,
                'roles' => $u->roles->map(fn($r) => [
                    'id' => $r->id,
                    'code' => $r->code,
                    'name' => $r->name,
                    'name_key' => $r->name_key
                ]),
            ];
        });

        return \App\Http\Responses\ApiResponse::success($result);
    }

    public function index(Request $request)
    {
        $query = User::with(['roles', 'person.department']);

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $users = $query->orderBy('name')->paginate($request->get('per_page', 25));

        return response()->json([
            'data' => [
                'items' => $users->items(),
                'total' => $users->total(),
                'last_page' => $users->lastPage()
            ]
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:8',
            'roles' => 'array',
            'roles.*' => 'exists:roles,code',
            'person_id' => 'nullable|exists:people,id',
            'is_active' => 'boolean',
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'is_active' => $validated['is_active'] ?? true,
        ]);

        if (!empty($validated['roles'])) {
            $roleIds = Role::whereIn('code', $validated['roles'])->pluck('id');
            $user->roles()->sync($roleIds);
        }

        if (!empty($validated['person_id'])) {
            Person::where('id', $validated['person_id'])->update(['user_id' => $user->id]);
        }

        return response()->json(['data' => $user->load(['roles', 'person'])]);
    }

    public function show(User $user)
    {
        return response()->json(['data' => $user->load(['roles', 'person'])]);
    }

    public function update(Request $request, User $user)
    {
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => ['sometimes', 'required', 'email', Rule::unique('users')->ignore($user->id)],
            'password' => 'nullable|string|min:8',
            'roles' => 'array',
            'roles.*' => 'exists:roles,code',
            'person_id' => 'nullable|exists:people,id',
            'is_active' => 'boolean',
        ]);

        if (isset($validated['name'])) {
            $user->name = $validated['name'];
        }

        if (isset($validated['email'])) {
            $user->email = $validated['email'];
        }

        if (!empty($validated['password'])) {
            $user->password = Hash::make($validated['password']);
        }

        if (isset($validated['is_active'])) {
            $user->is_active = $validated['is_active'];
        }

        $user->save();

        if (isset($validated['roles'])) {
            $roleIds = Role::whereIn('code', $validated['roles'])->pluck('id');
            $user->roles()->sync($roleIds);
        }

        if (array_key_exists('person_id', $validated)) {
            // Unlink old person if any
            Person::where('user_id', $user->id)->update(['user_id' => null]);
            // Link new person
            if (!empty($validated['person_id'])) {
                Person::where('id', $validated['person_id'])->update(['user_id' => $user->id]);
            }
        }

        return response()->json(['data' => $user->load(['roles', 'person'])]);
    }

    public function toggleActive(User $user)
    {
        // Don't allow a user to disable themselves
        if (auth()->id() === $user->id) {
            return response()->json(['message' => 'Cannot disable your own account'], 400);
        }

        $user->is_active = !$user->is_active;
        $user->save();

        return response()->json(['data' => $user]);
    }

    // List all roles for the dropdown
    public function getRoles()
    {
        return response()->json(['data' => Role::all()]);
    }

    // List available unlinked people for dropdown
    public function getAvailablePeople(Request $request)
    {
        $query = Person::whereNull('user_id');
        
        // If editing a user, include their currently linked person
        if ($request->filled('current_user_id')) {
            $query->orWhere('user_id', $request->current_user_id);
        }

        $people = $query->orderBy('full_name_ar')->get(['id', 'full_name_ar', 'full_name_en', 'specialty', 'staff_code']);
        
        return response()->json(['data' => $people]);
    }

    /**
        /**
     * Update User
     */
    public function update(Request $request, User $user)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => ['required', 'email', Rule::unique('users')->ignore($user->id)],
            'roles' => 'array',
            'roles.*' => 'exists:roles,code',
            'is_active' => 'boolean',
        ]);

        $user->update([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'is_active' => $validated['is_active'] ?? $user->is_active,
        ]);

        if (isset($validated['roles'])) {
            $roleIds = Role::whereIn('code', $validated['roles'])->pluck('id');
            $user->roles()->sync($roleIds);
        }

        return \App\Http\Responses\ApiResponse::success(
            $user->load('roles'),
            'تم تحديث بيانات الحساب بنجاح.'
        );
    }

    /**
     * Delete User Permanently
     */
    public function destroy(User $user)
    {
        // Safety Protection: Cannot delete logged in user or primary admin
        if (auth()->id() === $user->id) {
            return \App\Http\Responses\ApiResponse::error('لا يمكن حذف حسابك الشخصي المتصل حالياً.', 422);
        }

        if ($user->email === 'admin1@hebron.edu') {
            return \App\Http\Responses\ApiResponse::error('لا يمكن حذف حساب مدير النظام الرئيسي (admin1@hebron.edu).', 422);
        }

        // Detach roles & remove person link
        $user->roles()->detach();
        if ($user->person) {
            $user->person->update(['user_id' => null]);
        }

        $user->delete();

        return \App\Http\Responses\ApiResponse::success(null, 'تم حذف الحساب نهائياً من النظام بنجاح.');
    }

    /**
     * Reset User Password
     */
    public function resetPassword(Request $request, User $user)
    {
        $validated = $request->validate([
            'password' => 'required|string|min:6',
        ]);

        $user->update([
            'password' => Hash::make($validated['password']),
        ]);

        return \App\Http\Responses\ApiResponse::success(null, 'تم تعيين كلمة المرور الجديدة للحساب بنجاح.');
    }

    /**
     * Toggle User Active Status
     */
    public function toggleActive(User $user)
    {
        if (auth()->id() === $user->id) {
            return \App\Http\Responses\ApiResponse::error('لا يمكن تجميد حسابك الشخصي المتصل حالياً.', 422);
        }

        $user->is_active = !$user->is_active;
        $user->save();

        $status = $user->is_active ? 'تفعيل' : 'تجميد';
        return \App\Http\Responses\ApiResponse::success($user, "تم {$status} الحساب بنجاح.");
    }

    /**
     * PUT /api/v1/users/{user}/assign-levels
     * Assigns grade cohort levels to an RTA/Supervisor user.
     * Only department_head and admin_assistant roles can call this.
     */
    public function assignLevels(Request $request, User $user)
    {
        $validated = $request->validate([
            'assigned_levels' => 'nullable|array',
            'assigned_levels.*' => 'string|in:fourth,fifth,sixth',
        ]);

        $user->assigned_levels = !empty($validated['assigned_levels']) ? $validated['assigned_levels'] : null;
        $user->save();

        return response()->json([
            'data' => $user->only(['id', 'name', 'email', 'assigned_levels']),
            'message' => 'تم تحديث الدفعات المخصصة بنجاح.'
        ]);
    }

    /**
     * GET /api/v1/users/rta-list
     * Returns only users with RTA role (Research & Teaching Assistants) with their assigned_levels.
     * Clinical Supervisors (doctors) are excluded — their student assignments come from distribution.
     */
    public function rtaList()
    {
        $users = User::with('roles')
            ->whereHas('roles', fn($q) => $q->where('code', 'RTA'))
            ->get(['id', 'name', 'email', 'assigned_levels', 'is_active']);

        return response()->json(['data' => $users->map(fn($u) => [
            'id' => $u->id,
            'name' => $u->name,
            'email' => $u->email,
            'assigned_levels' => $u->assigned_levels,
            'is_active' => $u->is_active,
            'roles' => $u->roles->pluck('code'),
        ])]);
    }
}

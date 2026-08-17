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
        $users = User::where('is_active', true)->orderBy('name')->get(['id', 'name', 'email']);
        return \App\Http\Responses\ApiResponse::success($users);
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
}

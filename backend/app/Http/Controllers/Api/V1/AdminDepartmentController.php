<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Department;
use App\Models\DepartmentHeadAssignment;
use App\Models\Person;
use App\Models\User;
use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AdminDepartmentController extends Controller
{
    /**
     * GET /api/v1/admin/departments
     */
    public function index(Request $request)
    {
        $query = Department::query()
            ->with([
                'headAssignments' => function ($q) {
                    $q->where('is_current', true)->with('person');
                },
                'people' => function ($q) {
                    $q->select('id', 'department_id', 'full_name_ar', 'email', 'specialty');
                }
            ]);

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name_ar', 'like', "%{$search}%")
                  ->orWhere('name_en', 'like', "%{$search}%")
                  ->orWhere('code', 'like', "%{$search}%");
            });
        }

        if ($request->filled('dept_type') && $request->dept_type !== 'ALL') {
            $query->where('dept_type', $request->dept_type);
        }

        if ($request->has('is_active') && $request->is_active !== null && $request->is_active !== '') {
            $query->where('is_active', filter_var($request->is_active, FILTER_VALIDATE_BOOLEAN));
        }

        $departments = $query->orderBy('name_ar')->get();

        $result = $departments->map(function ($dept) {
            $currentHead = $dept->headAssignments->firstWhere('role_type', 'head')?->person;
            $currentRta = $dept->headAssignments->firstWhere('role_type', 'rta')?->person;

            return [
                'id'                     => $dept->id,
                'code'                   => $dept->code,
                'name_ar'                => $dept->name_ar,
                'name_en'                => $dept->name_en,
                'dept_type'              => $dept->dept_type,
                'serves_academic_levels' => $dept->serves_academic_levels ?? [],
                'is_active'              => (bool) $dept->is_active,
                'notes'                  => $dept->notes,
                'people_count'           => $dept->people->count(),
                'current_head'           => $currentHead ? [
                    'id'              => $currentHead->id,
                    'full_name_ar'    => $currentHead->full_name_ar,
                    'full_name_en'    => $currentHead->full_name_en,
                    'email'           => $currentHead->email,
                    'academic_degree' => $currentHead->academic_degree,
                    'specialty'       => $currentHead->specialty,
                    'user_id'         => $currentHead->user_id,
                ] : null,
                'current_rta'            => $currentRta ? [
                    'id'              => $currentRta->id,
                    'full_name_ar'    => $currentRta->full_name_ar,
                    'full_name_en'    => $currentRta->full_name_en,
                    'email'           => $currentRta->email,
                    'academic_degree' => $currentRta->academic_degree,
                    'specialty'       => $currentRta->specialty,
                    'user_id'         => $currentRta->user_id,
                ] : null,
                'created_at'             => $dept->created_at?->toIso8601String(),
                'updated_at'             => $dept->updated_at?->toIso8601String(),
            ];
        });

        return ApiResponse::success($result);
    }

    /**
     * GET /api/v1/admin/departments/candidates
     * Returns ONLY users with role DEPARTMENT_HEAD for heads, and role RTA for TAs.
     */
    public function candidates()
    {
        // 1. Head candidates: Users with role DEPARTMENT_HEAD
        $headUsers = User::whereHas('roles', function ($q) {
            $q->whereIn('code', ['DEPARTMENT_HEAD', 'department_head']);
        })->orderBy('name')->get();

        $headCandidates = [];
        foreach ($headUsers as $u) {
            $person = Person::where('user_id', $u->id)->first();
            $headCandidates[] = [
                'id'              => $person ? $person->id : ('user_' . $u->id),
                'person_id'       => $person?->id,
                'user_id'         => $u->id,
                'full_name_ar'    => $person?->full_name_ar ?? $u->name,
                'full_name_en'    => $person?->full_name_en,
                'email'           => $u->email,
                'academic_degree' => $person?->academic_degree ?? 'دكتور',
                'specialty'       => $person?->specialty,
            ];
        }

        // 2. TA candidates: Users with role RTA
        $rtaUsers = User::whereHas('roles', function ($q) {
            $q->whereIn('code', ['RTA', 'rta']);
        })->orderBy('name')->get();

        $rtaCandidates = [];
        foreach ($rtaUsers as $u) {
            $person = Person::where('user_id', $u->id)->first();
            $rtaCandidates[] = [
                'id'              => $person ? $person->id : ('user_' . $u->id),
                'person_id'       => $person?->id,
                'user_id'         => $u->id,
                'full_name_ar'    => $person?->full_name_ar ?? $u->name,
                'full_name_en'    => $person?->full_name_en,
                'email'           => $u->email,
                'academic_degree' => $person?->academic_degree ?? 'مساعد بحث وتدريس',
                'specialty'       => $person?->specialty,
            ];
        }

        return ApiResponse::success([
            'head_candidates' => $headCandidates,
            'rta_candidates'  => $rtaCandidates,
        ]);
    }

    /**
     * POST /api/v1/admin/departments
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'code'                   => 'required|string|max:50|unique:departments,code',
            'name_ar'                => 'required|string|max:255',
            'name_en'                => 'required|string|max:255',
            'dept_type'              => 'required|string|in:primary,sub',
            'serves_academic_levels' => 'nullable|array',
            'serves_academic_levels.*' => 'string',
            'is_active'              => 'boolean',
            'notes'                  => 'nullable|string|max:1000',
            'head_person_id'         => 'nullable',
            'rta_person_id'          => 'nullable',
        ]);

        return DB::transaction(function () use ($validated) {
            $department = Department::create([
                'code'                   => strtoupper(trim($validated['code'])),
                'name_ar'                => trim($validated['name_ar']),
                'name_en'                => trim($validated['name_en']),
                'dept_type'              => $validated['dept_type'],
                'serves_academic_levels' => $validated['serves_academic_levels'] ?? [],
                'is_active'              => $validated['is_active'] ?? true,
                'notes'                  => $validated['notes'] ?? null,
            ]);

            // Assign Head if provided
            if (!empty($validated['head_person_id'])) {
                $this->assignLeaderInternal($department->id, $validated['head_person_id'], 'head');
            }

            // Assign TA if provided
            if (!empty($validated['rta_person_id'])) {
                $this->assignLeaderInternal($department->id, $validated['rta_person_id'], 'rta');
            }

            return ApiResponse::success($department, 'تم إنشاء القسم الأكاديمي بنجاح.');
        });
    }

    /**
     * PUT /api/v1/admin/departments/{department}
     */
    public function update(Request $request, Department $department)
    {
        $validated = $request->validate([
            'code'                   => ['required', 'string', 'max:50', Rule::unique('departments')->ignore($department->id)],
            'name_ar'                => 'required|string|max:255',
            'name_en'                => 'required|string|max:255',
            'dept_type'              => 'required|string|in:primary,sub',
            'serves_academic_levels' => 'nullable|array',
            'serves_academic_levels.*' => 'string',
            'is_active'              => 'boolean',
            'notes'                  => 'nullable|string|max:1000',
            'head_person_id'         => 'nullable',
            'rta_person_id'          => 'nullable',
        ]);

        return DB::transaction(function () use ($department, $validated) {
            $department->update([
                'code'                   => strtoupper(trim($validated['code'])),
                'name_ar'                => trim($validated['name_ar']),
                'name_en'                => trim($validated['name_en']),
                'dept_type'              => $validated['dept_type'],
                'serves_academic_levels' => $validated['serves_academic_levels'] ?? [],
                'is_active'              => $validated['is_active'] ?? $department->is_active,
                'notes'                  => $validated['notes'] ?? null,
            ]);

            // Sync Head
            if (array_key_exists('head_person_id', $validated)) {
                $headVal = $validated['head_person_id'] ?: null;
                $this->assignLeaderInternal($department->id, $headVal, 'head');
            }

            // Sync TA
            if (array_key_exists('rta_person_id', $validated)) {
                $rtaVal = $validated['rta_person_id'] ?: null;
                $this->assignLeaderInternal($department->id, $rtaVal, 'rta');
            }

            return ApiResponse::success($department->fresh(), 'تم تحديث بيانات القسم بنجاح.');
        });
    }

    /**
     * POST /api/v1/admin/departments/{department}/assign-leaders
     */
    public function assignLeaders(Request $request, Department $department)
    {
        $validated = $request->validate([
            'head_person_id' => 'nullable',
            'rta_person_id'  => 'nullable',
        ]);

        return DB::transaction(function () use ($department, $validated) {
            if (array_key_exists('head_person_id', $validated)) {
                $headVal = $validated['head_person_id'] ?: null;
                $this->assignLeaderInternal($department->id, $headVal, 'head');
            }

            if (array_key_exists('rta_person_id', $validated)) {
                $rtaVal = $validated['rta_person_id'] ?: null;
                $this->assignLeaderInternal($department->id, $rtaVal, 'rta');
            }

            return ApiResponse::success(null, 'تم تحديث رئيس القسم ومساعد البحث والتدريس بنجاح.');
        });
    }

    /**
     * POST /api/v1/admin/departments/{department}/toggle
     */
    public function toggle(Department $department)
    {
        $department->is_active = !$department->is_active;
        $department->save();

        $status = $department->is_active ? 'تفعيل' : 'تجميد';
        return ApiResponse::success($department, "تم {$status} القسم الأكاديمي بنجاح.");
    }

    /**
     * DELETE /api/v1/admin/departments/{department}
     */
    public function destroy(Department $department)
    {
        return DB::transaction(function () use ($department) {
            $peopleCount = $department->people()->count();
            if ($peopleCount > 0) {
                $department->people()->update(['department_id' => null]);
            }

            DepartmentHeadAssignment::where('department_id', $department->id)->delete();

            $department->delete();

            return ApiResponse::success(null, 'تم حذف القسم الأكاديمي بنجاح.');
        });
    }

    /**
     * Internal helper to atomically assign or remove a department leader (head/rta)
     */
    private function assignLeaderInternal(int $departmentId, mixed $rawCandidateId, string $roleType): void
    {
        // 1. Resolve Person ID from raw ID (which may be person_id or 'user_X')
        $personId = null;
        $userId = null;

        if (!empty($rawCandidateId)) {
            if (is_numeric($rawCandidateId)) {
                $person = Person::find((int) $rawCandidateId);
                if ($person) {
                    $personId = $person->id;
                    $userId = $person->user_id;
                } else {
                    // Check if numeric candidate ID was user_id
                    $user = User::find((int) $rawCandidateId);
                    if ($user) {
                        $userId = $user->id;
                        $person = Person::firstOrCreate(
                            ['user_id' => $user->id],
                            [
                                'full_name_ar' => $user->name,
                                'email'        => $user->email,
                                'is_active'    => true,
                            ]
                        );
                        $personId = $person->id;
                    }
                }
            } elseif (is_string($rawCandidateId) && str_starts_with($rawCandidateId, 'user_')) {
                $extractedUserId = (int) str_replace('user_', '', $rawCandidateId);
                $user = User::find($extractedUserId);
                if ($user) {
                    $userId = $user->id;
                    $person = Person::firstOrCreate(
                        ['user_id' => $user->id],
                        [
                            'full_name_ar' => $user->name,
                            'email'        => $user->email,
                            'is_active'    => true,
                        ]
                    );
                    $personId = $person->id;
                }
            }
        }

        // 2. End previous current assignment for this department & role_type
        $currentAssignment = DepartmentHeadAssignment::where('department_id', $departmentId)
            ->where('role_type', $roleType)
            ->where('is_current', true)
            ->first();

        if ($currentAssignment) {
            if ($currentAssignment->person_id === $personId) {
                // Same person already assigned, no change needed
                return;
            }

            $currentAssignment->update([
                'is_current' => false,
                'ended_at'   => now()->toDateString(),
            ]);

            // Clear old person's user role scope if linked
            $oldPerson = Person::find($currentAssignment->person_id);
            if ($oldPerson && $oldPerson->user_id) {
                $roleCode = $roleType === 'head' ? 'DEPARTMENT_HEAD' : 'RTA';
                $role = Role::where('code', $roleCode)->first();
                if ($role) {
                    DB::table('user_roles')
                        ->where('user_id', $oldPerson->user_id)
                        ->where('role_id', $role->id)
                        ->where('scope_id', $departmentId)
                        ->update(['scope_id' => null, 'scope_type' => 'global']);
                }
            }
        }

        // 3. If new person is selected, create new current assignment
        if ($personId) {
            DepartmentHeadAssignment::create([
                'department_id' => $departmentId,
                'person_id'     => $personId,
                'role_type'     => $roleType,
                'started_at'    => now()->toDateString(),
                'is_current'    => true,
            ]);

            // Update person's department
            $person = Person::find($personId);
            if ($person) {
                $person->update(['department_id' => $departmentId]);
            }

            // Sync user role scope if user is attached
            if ($userId) {
                $roleCode = $roleType === 'head' ? 'DEPARTMENT_HEAD' : 'RTA';
                $role = Role::where('code', $roleCode)->first();
                if ($role) {
                    $user = User::find($userId);
                    if ($user) {
                        if (!$user->hasRole($roleCode)) {
                            $user->roles()->attach($role->id, [
                                'scope_type' => 'department',
                                'scope_id'   => $departmentId,
                            ]);
                        } else {
                            DB::table('user_roles')
                                ->where('user_id', $user->id)
                                ->where('role_id', $role->id)
                                ->update([
                                    'scope_type' => 'department',
                                    'scope_id'   => $departmentId,
                                ]);
                        }
                    }
                }
            }
        }
    }
}

<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\User;
use App\Models\UserProfile;
use App\Services\SecureFileUploadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class UserProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return ApiResponse::success($this->present($request->user()));
    }

    public function update(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $payload = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'full_name_en' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:40'],
            'specialty' => ['nullable', 'string', 'max:255'],
            'academic_degree' => ['nullable', 'string', 'max:255'],
            'bio' => ['nullable', 'string', 'max:3000'],
        ]);

        $user->update(['name' => $payload['name']]);
        $profile = UserProfile::firstOrCreate(['user_id' => $user->id]);
        $profile->update([
            'full_name_en' => $payload['full_name_en'] ?? null,
            'phone' => $payload['phone'] ?? null,
            'specialty' => $payload['specialty'] ?? null,
            'academic_degree' => $payload['academic_degree'] ?? null,
            'bio' => $payload['bio'] ?? null,
        ]);

        // Person is the canonical personnel record where it exists. Keeping it
        // synchronized makes edits immediately visible in staff, hospital and
        // supervisor directories without granting users access to HR fields.
        if ($user->person) {
            $user->person->update([
                'full_name_ar' => $payload['name'],
                'full_name_en' => $payload['full_name_en'] ?? null,
                'phone' => $payload['phone'] ?? null,
                'specialty' => $payload['specialty'] ?? null,
                'academic_degree' => $payload['academic_degree'] ?? null,
            ]);
        }

        // Keep the small set of shared fields in legacy role profiles aligned
        // while those profiles continue to own their CV, documents and KPI.
        foreach ([$user->departmentHeadProfile, $user->clinicalSupervisorProfile] as $roleProfile) {
            if ($roleProfile) {
                $roleProfile->update([
                    'academic_title' => $payload['academic_degree'] ?? null,
                    'specialty' => $payload['specialty'] ?? null,
                    'phone' => $payload['phone'] ?? null,
                ]);
            }
        }

        return ApiResponse::success($this->present($user->fresh()));
    }

    public function uploadAvatar(Request $request, SecureFileUploadService $files): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $source = $request->file('avatar') ?: $request->input('avatar_base64');
        if (! $source) {
            throw ValidationException::withMessages(['avatar' => ['يرجى اختيار صورة شخصية صالحة.']]);
        }

        $profile = UserProfile::firstOrCreate(['user_id' => $user->id]);
        $stored = $files->storeAvatar($source, 'avatars/users/'.$user->id);
        $oldPath = $profile->avatar_storage_path;

        $profile->update([
            'avatar_url' => $stored['url'],
            'avatar_storage_path' => $stored['path'],
        ]);
        if ($user->person) {
            $user->person->update(['photo_url' => $stored['url']]);
        }
        if ($oldPath && $oldPath !== $stored['path']) {
            Storage::disk('public')->delete($oldPath);
        }

        return ApiResponse::success($this->present($user->fresh()), 'تم تحديث الصورة الشخصية.');
    }

    public function updatePassword(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $payload = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        if (! Hash::check($payload['current_password'], $user->password)) {
            throw ValidationException::withMessages(['current_password' => ['كلمة المرور الحالية غير صحيحة.']]);
        }

        $user->update(['password' => $payload['password']]);

        return ApiResponse::success(null, 'تم تغيير كلمة المرور بنجاح.');
    }

    /** @return array<string, mixed> */
    private function present(User $user): array
    {
        $user->loadMissing([
            'roles',
            'person.department',
            'person.primarySite',
            'userProfile',
            'departmentHeadProfile',
            'clinicalSupervisorProfile',
        ]);

        $person = $user->person;
        $profile = $user->userProfile;
        $departmentHeadProfile = $user->departmentHeadProfile;
        $supervisorProfile = $user->clinicalSupervisorProfile;
        $avatar = $profile?->avatar_url
            ?: $person?->photo_url
            ?: $supervisorProfile?->avatar_url
            ?: $departmentHeadProfile?->avatar_url;
        $phone = $profile?->phone ?: $person?->phone ?: $supervisorProfile?->phone ?: $departmentHeadProfile?->phone;
        $specialty = $profile?->specialty ?: $person?->specialty ?: $supervisorProfile?->specialty ?: $departmentHeadProfile?->specialty;
        $degree = $profile?->academic_degree ?: $person?->academic_degree ?: $supervisorProfile?->academic_title ?: $departmentHeadProfile?->academic_title;

        $completion = collect([$user->name, $avatar, $phone, $specialty, $degree])
            ->filter(fn ($value) => filled($value))
            ->count() * 20;

        return [
            'id' => $user->id,
            'name' => $person?->full_name_ar ?: $user->name,
            'full_name_en' => $profile?->full_name_en ?: $person?->full_name_en,
            'email' => $user->email,
            'phone' => $phone,
            'specialty' => $specialty,
            'academic_degree' => $degree,
            'bio' => $profile?->bio,
            'avatar_url' => $avatar,
            'roles' => $user->roles->pluck('code')->values(),
            'assigned_levels' => $user->assigned_levels ?: [],
            'department' => $person?->department ? [
                'id' => $person->department->id,
                'name_ar' => $person->department->name_ar,
                'name_en' => $person->department->name_en,
            ] : null,
            'primary_site' => $person?->primarySite ? [
                'id' => $person->primarySite->id,
                'name_ar' => $person->primarySite->name_ar,
                'name_en' => $person->primarySite->name_en,
            ] : null,
            'staff_code' => $person?->staff_code,
            'completion_percent' => $completion,
        ];
    }
}

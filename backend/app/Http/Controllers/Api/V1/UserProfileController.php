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
use Illuminate\Support\Str;
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
            'bio' => ['nullable', 'string', 'max:3000'],
        ]);

        $user->update(['name' => $payload['name']]);
        $profile = UserProfile::firstOrCreate(['user_id' => $user->id]);
        $profile->update([
            'full_name_en' => $payload['full_name_en'] ?? null,
            'phone' => $payload['phone'] ?? null,
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
            ]);
        }

        // Keep the small set of shared fields in legacy role profiles aligned
        // while those profiles continue to own their CV, documents and KPI.
        foreach ([$user->departmentHeadProfile, $user->clinicalSupervisorProfile] as $roleProfile) {
            if ($roleProfile) {
                $roleProfile->update([
                    'phone' => $payload['phone'] ?? null,
                ]);
            }
        }

        return ApiResponse::success($this->present($user->fresh()));
    }

    public function updateProfessional(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless($this->supportsProfessionalProfile($user), 403);

        $payload = $request->validate([
            'bio' => ['nullable', 'string', 'max:3000'],
            'publications' => ['present', 'array', 'max:100'],
            'publications.*.title' => ['required', 'string', 'max:500'],
            'publications.*.journal' => ['nullable', 'string', 'max:255'],
            'publications.*.year' => ['nullable', 'integer', 'between:1900,2100'],
            'publications.*.doi' => ['nullable', 'string', 'max:255'],
            'conferences' => ['present', 'array', 'max:100'],
            'conferences.*.name' => ['required', 'string', 'max:500'],
            'conferences.*.location' => ['nullable', 'string', 'max:255'],
            'conferences.*.date' => ['nullable', 'string', 'max:40'],
            'conferences.*.role' => ['nullable', 'string', 'max:255'],
        ]);

        $profile = UserProfile::firstOrCreate(['user_id' => $user->id]);
        $profile->update([
            'bio' => $payload['bio'] ?? null,
            'publications' => array_values($payload['publications']),
            'conferences' => array_values($payload['conferences']),
        ]);
        $this->syncProfessionalLegacy($user, $profile);

        return ApiResponse::success($this->present($user->fresh()), __('Profile updated successfully.'));
    }

    public function uploadDocument(Request $request, SecureFileUploadService $files): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless($this->supportsProfessionalProfile($user), 403);
        $payload = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'category' => ['required', 'string', 'max:80'],
        ]);
        $source = $request->file('file') ?: $request->input('file_base64');
        if (! $source) {
            throw ValidationException::withMessages(['file' => [__('Please select a valid document.')]]);
        }

        $stored = $files->storeDocument($source, 'profile-documents/users/'.$user->id);
        $document = [
            'id' => 'doc_'.Str::uuid(),
            'name' => $payload['name'],
            'category' => $payload['category'],
            'storage_path' => $stored['storage_path'],
            'mime_type' => $stored['mime_type'],
            'file_type' => $stored['file_type'],
            'file_size' => round($stored['size_bytes'] / (1024 * 1024), 2).' MB',
            'created_at' => now()->toDateString(),
        ];
        $profile = UserProfile::firstOrCreate(['user_id' => $user->id]);
        $documents = is_array($profile->documents) ? $profile->documents : [];
        $documents[] = $document;
        $profile->update(['documents' => $documents]);
        $this->syncProfessionalLegacy($user, $profile->fresh());

        return ApiResponse::success($this->present($user->fresh()), __('Document uploaded successfully.'));
    }

    public function deleteDocument(Request $request, string $docId): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless($this->supportsProfessionalProfile($user), 403);
        $profile = UserProfile::where('user_id', $user->id)->firstOrFail();
        $documents = is_array($profile->documents) ? $profile->documents : [];
        $document = collect($documents)->first(fn (array $item) => (string) ($item['id'] ?? '') === $docId);
        abort_unless($document, 404);
        if (filled($document['storage_path'] ?? null)) {
            Storage::disk('local')->delete($document['storage_path']);
        }
        $profile->update(['documents' => array_values(array_filter(
            $documents,
            fn (array $item) => (string) ($item['id'] ?? '') !== $docId
        ))]);
        $this->syncProfessionalLegacy($user, $profile->fresh());

        return ApiResponse::success($this->present($user->fresh()), __('Document deleted successfully.'));
    }

    public function downloadDocument(Request $request, string $docId)
    {
        /** @var User $user */
        $user = $request->user();
        $profile = UserProfile::where('user_id', $user->id)->firstOrFail();
        $document = collect($profile->documents ?: [])->first(
            fn (array $item) => (string) ($item['id'] ?? '') === $docId
        );
        if (! $document || empty($document['storage_path']) || ! Storage::disk('local')->exists($document['storage_path'])) {
            abort(404);
        }
        $filename = preg_replace('/[^\pL\pN._-]+/u', '_', (string) ($document['name'] ?? 'document'))
            .'.'.($document['file_type'] ?? 'bin');

        return Storage::disk('local')->download($document['storage_path'], $filename, [
            'Content-Type' => $document['mime_type'] ?? 'application/octet-stream',
            'X-Content-Type-Options' => 'nosniff',
        ]);
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
            'person.trainingSites',
            'person.headAssignments' => fn ($query) => $query->current()->heads()->with('department'),
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
        $roles = $user->roles->pluck('code')->values();
        $professional = $this->supportsProfessionalProfile($user);
        $requirements = [
            'name' => $person?->full_name_ar ?: $user->name,
            'full_name_en' => $profile?->full_name_en ?: $person?->full_name_en,
            'phone' => $phone,
        ];
        if ($professional) {
            $requirements += ['specialty' => $specialty, 'academic_degree' => $degree, 'bio' => $profile?->bio];
        }
        $completeCount = collect($requirements)->filter(fn ($value) => filled($value))->count();
        $completion = (int) round(($completeCount / count($requirements)) * 100);
        $currentHeadAssignment = $person?->headAssignments?->first();

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
            'roles' => $roles,
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
            'missing_fields' => collect($requirements)->filter(fn ($value) => blank($value))->keys()->values(),
            'capabilities' => [
                'professional_profile' => $professional,
                'clinical_supervisor' => $roles->contains('CLINICAL_SUPERVISOR'),
                'department_head' => $roles->contains('DEPARTMENT_HEAD') || $currentHeadAssignment !== null,
            ],
            'employment' => $person ? [
                'license_number' => $person->license_number,
                'contract_type' => $person->contract_type ?: $supervisorProfile?->contract_type ?: $departmentHeadProfile?->contract_type,
                'contract_start' => $person->contract_start?->toDateString(),
                'contract_end' => $person->contract_end?->toDateString(),
                'teaching_hours_per_week' => $person->teaching_hours_per_week,
                'available_days' => $person->available_days,
                'max_students' => $person->max_students,
            ] : null,
            'training_sites' => $person?->trainingSites?->map(fn ($site) => [
                'id' => $site->id,
                'name_ar' => $site->name_ar,
                'name_en' => $site->name_en,
                'is_primary' => (bool) $site->pivot?->is_primary,
            ])->values() ?? [],
            'department_head_assignment' => $currentHeadAssignment ? [
                'department_name_ar' => $currentHeadAssignment->department?->name_ar,
                'department_name_en' => $currentHeadAssignment->department?->name_en,
                'started_at' => $currentHeadAssignment->started_at?->toDateString(),
                'ended_at' => $currentHeadAssignment->ended_at?->toDateString(),
            ] : null,
            'professional' => $professional ? [
                'bio' => $profile?->bio ?: $supervisorProfile?->cv_summary ?: $departmentHeadProfile?->cv_summary,
                'publications' => $profile?->publications ?: $supervisorProfile?->publications ?: $departmentHeadProfile?->publications ?: [],
                'conferences' => $profile?->conferences ?: $supervisorProfile?->conferences ?: $departmentHeadProfile?->conferences ?: [],
                'documents' => collect($profile?->documents ?: $supervisorProfile?->documents ?: $departmentHeadProfile?->documents ?: [])->map(function (array $document): array {
                    unset($document['storage_path']);
                    $document['download_url'] = '/api/v1/profile/me/documents/'.($document['id'] ?? '').'/download';

                    return $document;
                })->values(),
            ] : null,
        ];
    }

    private function supportsProfessionalProfile(User $user): bool
    {
        $roles = $user->relationLoaded('roles') ? $user->roles : $user->roles()->get();

        if ($roles->pluck('code')->intersect([
            'CLINICAL_SUPERVISOR', 'DEPARTMENT_HEAD', 'CLINICAL_DIRECTOR',
            'DEAN', 'VICE_DEAN', 'RTA', 'ACADEMIC_ADVISOR',
        ])->isNotEmpty()) {
            return true;
        }

        return $user->person?->headAssignments()->current()->heads()->exists() ?? false;
    }

    private function syncProfessionalLegacy(User $user, UserProfile $profile): void
    {
        $user->loadMissing('roles');
        $values = [
            'cv_summary' => $profile->bio,
            'publications' => $profile->publications ?: [],
            'conferences' => $profile->conferences ?: [],
            'documents' => $profile->documents ?: [],
        ];
        if ($user->roles->pluck('code')->contains('CLINICAL_SUPERVISOR')) {
            $user->clinicalSupervisorProfile()->firstOrCreate()->update($values);
        }
        if ($user->roles->pluck('code')->contains('DEPARTMENT_HEAD') || $user->person?->headAssignments()->current()->heads()->exists()) {
            $user->departmentHeadProfile()->firstOrCreate()->update($values);
        }
    }
}

<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AuditLog;
use App\Models\ConfidentialFinancialAccessSession;
use App\Models\ConfidentialFinancialFile;
use App\Models\ConfidentialFinancialVault;
use App\Services\SecureFileUploadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

class ConfidentialFinancialVaultController extends Controller
{
    private const ACCESS_MINUTES = 30;

    public function index(): JsonResponse
    {
        $vaults = ConfidentialFinancialVault::query()
            ->withCount('files')
            ->with('creator.person')
            ->latest()
            ->get();

        return ApiResponse::success($vaults->map(fn ($vault) => $this->withPublicPath($vault)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'password' => ['required', 'string', 'max:255', 'confirmed', PasswordRule::min(12)->mixedCase()->numbers()->symbols()],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $vault = DB::transaction(function () use ($data, $request) {
            $token = Str::random(64);
            $vault = ConfidentialFinancialVault::create([
                'title' => trim($data['title']),
                'description' => $data['description'] ?? null,
                'share_token' => $token,
                'share_token_hash' => hash('sha256', $token),
                'password_hash' => Hash::make($data['password']),
                'is_active' => $data['is_active'] ?? true,
                'created_by' => $request->user()->id,
            ]);
            $this->audit($request, $vault, 'confidential_finance.vault_created');

            return $vault;
        });

        return ApiResponse::success($this->detail($vault), $this->tr('تم إنشاء الخزنة والرابط الدائم.', 'Vault and permanent link created.'), [], 201);
    }

    public function show(ConfidentialFinancialVault $confidentialFinancialVault): JsonResponse
    {
        return ApiResponse::success($this->detail($confidentialFinancialVault));
    }

    public function update(Request $request, ConfidentialFinancialVault $confidentialFinancialVault): JsonResponse
    {
        $data = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'password' => ['sometimes', 'nullable', 'string', 'max:255', 'confirmed', PasswordRule::min(12)->mixedCase()->numbers()->symbols()],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        DB::transaction(function () use ($data, $request, $confidentialFinancialVault) {
            $updates = collect($data)->only(['title', 'description', 'is_active'])->all();
            $passwordChanged = filled($data['password'] ?? null);
            if ($passwordChanged) {
                $updates['password_hash'] = Hash::make($data['password']);
            }
            $confidentialFinancialVault->update($updates);
            if ($passwordChanged || (($data['is_active'] ?? true) === false)) {
                $confidentialFinancialVault->accessSessions()->delete();
            }
            $this->audit($request, $confidentialFinancialVault, 'confidential_finance.vault_updated', [
                'password_changed' => $passwordChanged,
                'is_active' => $confidentialFinancialVault->is_active,
            ]);
        });

        return ApiResponse::success($this->detail($confidentialFinancialVault->fresh()), $this->tr('تم تحديث الخزنة دون تغيير رمز QR.', 'Vault updated without changing the QR code.'));
    }

    public function storeFiles(Request $request, ConfidentialFinancialVault $confidentialFinancialVault, SecureFileUploadService $uploads): JsonResponse
    {
        $request->validate([
            'files' => ['required', 'array', 'min:1', 'max:5'],
            'files.*' => ['required', 'file', 'max:20480', 'mimes:pdf,doc,docx,xls,xlsx,png,jpg,jpeg,webp,zip'],
        ]);
        $files = $request->file('files', []);
        if ($confidentialFinancialVault->files()->count() + count($files) > 10) {
            throw ValidationException::withMessages(['files' => [$this->tr('الحد الأعلى 10 ملفات في الخزنة.', 'A vault may contain at most 10 files.')]]);
        }

        $created = [];
        foreach ($files as $file) {
            $stored = $uploads->storeDocument($file, "confidential-finance/{$confidentialFinancialVault->id}");
            $created[] = $confidentialFinancialVault->files()->create([
                'uploaded_by' => $request->user()->id,
                'original_name' => $file->getClientOriginalName(),
                'stored_path' => $stored['storage_path'],
                'mime_type' => $stored['mime_type'],
                'file_size' => $stored['size_bytes'],
            ]);
        }
        $this->audit($request, $confidentialFinancialVault, 'confidential_finance.files_added', ['count' => count($created)]);

        return ApiResponse::success($created, $this->tr('تم رفع الملفات إلى التخزين الخاص.', 'Files uploaded to private storage.'), [], 201);
    }

    public function internalFile(ConfidentialFinancialVault $confidentialFinancialVault, ConfidentialFinancialFile $file)
    {
        $this->ensureFile($confidentialFinancialVault, $file);

        return Storage::disk('local')->download($file->stored_path, $file->original_name, [
            'Cache-Control' => 'private, no-store',
            'X-Robots-Tag' => 'noindex, nofollow, noarchive',
        ]);
    }

    public function destroyFile(Request $request, ConfidentialFinancialVault $confidentialFinancialVault, ConfidentialFinancialFile $file): JsonResponse
    {
        $this->ensureFile($confidentialFinancialVault, $file);
        $file->delete();
        $this->audit($request, $confidentialFinancialVault, 'confidential_finance.file_removed', ['file_id' => $file->id]);

        return ApiResponse::success(null, $this->tr('تمت إزالة الملف.', 'File removed.'));
    }

    public function publicShow(Request $request, string $token): JsonResponse
    {
        $vault = $this->findActiveVault($token);
        $session = $this->validSession($request, $vault);
        $response = ApiResponse::success($session
            ? ['unlocked' => true, 'vault' => $this->publicPayload($vault)]
            : ['unlocked' => false]);

        return $this->noStore($response);
    }

    public function unlock(Request $request, string $token): JsonResponse
    {
        $data = $request->validate(['password' => ['required', 'string', 'max:255']]);
        $vault = $this->findActiveVault($token);
        if (! Hash::check($data['password'], $vault->password_hash)) {
            $this->audit($request, $vault, 'confidential_finance.unlock_failed');
            throw ValidationException::withMessages([
                'password' => [$this->tr('كلمة المرور غير صحيحة.', 'The password is incorrect.')],
            ]);
        }

        $plainToken = Str::random(64);
        $vault->accessSessions()->where('expires_at', '<=', now())->delete();
        $vault->accessSessions()->create([
            'token_hash' => hash('sha256', $plainToken),
            'ip_hash' => $this->fingerprint($request->ip() ?? ''),
            'user_agent_hash' => $this->fingerprint((string) $request->userAgent()),
            'expires_at' => now()->addMinutes(self::ACCESS_MINUTES),
            'last_used_at' => now(),
        ]);
        $vault->forceFill(['last_accessed_at' => now()])->saveQuietly();
        $vault->increment('successful_access_count');
        $this->audit($request, $vault, 'confidential_finance.unlocked');

        $response = ApiResponse::success([
            'unlocked' => true,
            'session_minutes' => self::ACCESS_MINUTES,
            'vault' => $this->publicPayload($vault),
        ]);
        $cookie = cookie(
            $this->cookieName($vault),
            $plainToken,
            self::ACCESS_MINUTES,
            "/api/v1/public/confidential-financial-vaults/{$token}",
            null,
            app()->environment('production') || $request->isSecure(),
            true,
            false,
            'strict',
        );

        return $this->noStore($response->withCookie($cookie));
    }

    public function publicFile(Request $request, string $token, ConfidentialFinancialFile $file)
    {
        $vault = $this->findActiveVault($token);
        abort_unless($this->validSession($request, $vault), 403);
        $this->ensureFile($vault, $file);
        $this->audit($request, $vault, 'confidential_finance.public_file_accessed', [
            'file_id' => $file->id,
            'download' => $request->boolean('download'),
        ]);

        if ($request->boolean('download')) {
            return Storage::disk('local')->download($file->stored_path, $file->original_name, [
                'Cache-Control' => 'private, no-store',
                'X-Robots-Tag' => 'noindex, nofollow, noarchive',
            ]);
        }

        return Storage::disk('local')->response($file->stored_path, $file->original_name, [
            'Content-Type' => $file->mime_type,
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
            'X-Robots-Tag' => 'noindex, nofollow, noarchive',
        ]);
    }

    private function detail(ConfidentialFinancialVault $vault): ConfidentialFinancialVault
    {
        $vault->load(['files.uploader.person', 'creator.person']);

        return $this->withPublicPath($vault);
    }

    private function withPublicPath(ConfidentialFinancialVault $vault): ConfidentialFinancialVault
    {
        $vault->setAttribute('public_path', '/secure/financial-documents/'.$vault->share_token);

        return $vault;
    }

    private function findActiveVault(string $token): ConfidentialFinancialVault
    {
        abort_unless(strlen($token) === 64, 404);

        return ConfidentialFinancialVault::query()
            ->where('share_token_hash', hash('sha256', $token))
            ->where('is_active', true)
            ->with('files')
            ->firstOrFail();
    }

    private function validSession(Request $request, ConfidentialFinancialVault $vault): ?ConfidentialFinancialAccessSession
    {
        $plainToken = (string) $request->cookie($this->cookieName($vault));
        if (strlen($plainToken) !== 64) {
            return null;
        }

        $session = $vault->accessSessions()
            ->where('token_hash', hash('sha256', $plainToken))
            ->where('expires_at', '>', now())
            ->first();
        if (! $session || ! hash_equals($session->ip_hash, $this->fingerprint($request->ip() ?? ''))
            || ! hash_equals((string) $session->user_agent_hash, $this->fingerprint((string) $request->userAgent()))) {
            return null;
        }

        $session->forceFill(['last_used_at' => now()])->saveQuietly();

        return $session;
    }

    private function publicPayload(ConfidentialFinancialVault $vault): array
    {
        return [
            'title' => $vault->title,
            'description' => $vault->description,
            'files' => $vault->files->map(fn ($file) => [
                'id' => $file->id,
                'original_name' => $file->original_name,
                'mime_type' => $file->mime_type,
                'file_size' => $file->file_size,
            ])->values(),
        ];
    }

    private function ensureFile(ConfidentialFinancialVault $vault, ConfidentialFinancialFile $file): void
    {
        abort_unless($file->confidential_financial_vault_id === $vault->id && Storage::disk('local')->exists($file->stored_path), 404);
    }

    private function cookieName(ConfidentialFinancialVault $vault): string
    {
        return 'cdms_financial_vault_'.$vault->id;
    }

    private function fingerprint(string $value): string
    {
        return hash_hmac('sha256', $value, (string) config('app.key'));
    }

    private function noStore(JsonResponse $response): JsonResponse
    {
        $response->headers->set('Cache-Control', 'private, no-store, max-age=0');
        $response->headers->set('X-Robots-Tag', 'noindex, nofollow, noarchive');

        return $response;
    }

    private function audit(Request $request, ConfidentialFinancialVault $vault, string $action, array $changes = []): void
    {
        AuditLog::create([
            'user_id' => $request->user()?->id,
            'action' => $action,
            'entity_type' => ConfidentialFinancialVault::class,
            'entity_id' => $vault->id,
            'changes' => $changes,
        ]);
    }

    private function tr(string $ar, string $en): string
    {
        return app()->getLocale() === 'ar' ? $ar : $en;
    }
}

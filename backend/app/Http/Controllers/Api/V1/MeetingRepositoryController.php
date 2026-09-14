<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AuditLog;
use App\Models\MeetingRepository;
use App\Models\MeetingRepositoryFile;
use App\Services\SecureFileUploadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class MeetingRepositoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $repositories = MeetingRepository::query()
            ->with(['meetings:id,minutes_number,meeting_type,meeting_date,status', 'creator.person'])
            ->withCount('files')
            ->when($request->filled('search'), function ($query) use ($request) {
                $search = trim($request->string('search')->toString());
                $query->where(fn ($nested) => $nested->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%"));
            })
            ->latest()
            ->paginate(min(max($request->integer('per_page', 25), 1), 100));

        return ApiResponse::success($repositories->items(), null, [
            'current_page' => $repositories->currentPage(),
            'last_page' => $repositories->lastPage(),
            'total' => $repositories->total(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $repository = DB::transaction(function () use ($data, $request) {
            $token = Str::random(64);
            $repository = MeetingRepository::create([
                'title' => trim($data['title']),
                'description' => $data['description'] ?? null,
                'share_token' => $token,
                'share_token_hash' => hash('sha256', $token),
                'is_active' => $data['is_active'] ?? true,
                'allow_download' => $data['allow_download'] ?? true,
                'expires_at' => $data['expires_at'] ?? null,
                'created_by' => $request->user()->id,
            ]);
            $repository->meetings()->sync($data['meeting_ids'] ?? []);
            $this->audit($request, $repository, 'meeting_repository.created', [
                'meeting_ids' => $data['meeting_ids'] ?? [],
            ]);

            return $repository;
        });

        return ApiResponse::success($this->detail($repository), $this->tr('تم إنشاء المستودع ورابط المشاركة.', 'Repository and share link created.'), [], 201);
    }

    public function show(MeetingRepository $meetingRepository): JsonResponse
    {
        return ApiResponse::success($this->detail($meetingRepository));
    }

    public function update(Request $request, MeetingRepository $meetingRepository): JsonResponse
    {
        $data = $request->validate($this->rules(true));
        DB::transaction(function () use ($data, $meetingRepository, $request) {
            $meetingRepository->update(collect($data)->only([
                'title', 'description', 'is_active', 'allow_download', 'expires_at',
            ])->all());
            if (array_key_exists('meeting_ids', $data)) {
                $meetingRepository->meetings()->sync($data['meeting_ids']);
            }
            $this->audit($request, $meetingRepository, 'meeting_repository.updated', [
                'meeting_ids' => $data['meeting_ids'] ?? null,
                'is_active' => $meetingRepository->is_active,
            ]);
        });

        return ApiResponse::success($this->detail($meetingRepository->fresh()), $this->tr('تم تحديث المستودع.', 'Repository updated.'));
    }

    public function rotateShareToken(Request $request, MeetingRepository $meetingRepository): JsonResponse
    {
        $token = Str::random(64);
        $meetingRepository->update([
            'share_token' => $token,
            'share_token_hash' => hash('sha256', $token),
            'is_active' => true,
        ]);
        $this->audit($request, $meetingRepository, 'meeting_repository.share_link_rotated');

        return ApiResponse::success($this->detail($meetingRepository->fresh()), $this->tr('تم تجديد رابط المشاركة وإبطال الرابط السابق.', 'Share link rotated and the previous link was revoked.'));
    }

    public function storeFiles(Request $request, MeetingRepository $meetingRepository, SecureFileUploadService $uploads): JsonResponse
    {
        $request->validate([
            'files' => ['required', 'array', 'min:1', 'max:10'],
            'files.*' => ['required', 'file', 'max:10240', 'mimes:pdf,doc,docx,xls,xlsx,png,jpg,jpeg,webp,zip'],
        ]);
        $files = $request->file('files', []);
        if ($meetingRepository->files()->count() + count($files) > 30) {
            throw ValidationException::withMessages(['files' => [$this->tr('الحد الأعلى 30 ملفًا في المستودع.', 'A repository may contain at most 30 files.')]]);
        }

        $created = [];
        foreach ($files as $file) {
            $stored = $uploads->storeDocument($file, "meeting-repositories/{$meetingRepository->id}");
            $created[] = $meetingRepository->files()->create([
                'uploaded_by' => $request->user()->id,
                'original_name' => $file->getClientOriginalName(),
                'stored_path' => $stored['storage_path'],
                'mime_type' => $stored['mime_type'],
                'file_size' => $stored['size_bytes'],
            ]);
        }
        $this->audit($request, $meetingRepository, 'meeting_repository.files_added', ['count' => count($created)]);

        return ApiResponse::success($created, $this->tr('تم رفع الملفات.', 'Files uploaded.'), [], 201);
    }

    public function downloadFile(MeetingRepository $meetingRepository, MeetingRepositoryFile $file)
    {
        $this->ensureFile($meetingRepository, $file);

        return Storage::disk('local')->download($file->stored_path, $file->original_name);
    }

    public function destroyFile(Request $request, MeetingRepository $meetingRepository, MeetingRepositoryFile $file): JsonResponse
    {
        $this->ensureFile($meetingRepository, $file);
        $file->delete();
        $this->audit($request, $meetingRepository, 'meeting_repository.file_removed', ['file_id' => $file->id]);

        return ApiResponse::success(null, $this->tr('تمت إزالة الملف من المستودع.', 'File removed from repository.'));
    }

    public function destroy(Request $request, MeetingRepository $meetingRepository): JsonResponse
    {
        $meetingRepository->update(['is_active' => false]);
        $meetingRepository->delete();
        $this->audit($request, $meetingRepository, 'meeting_repository.archived');

        return ApiResponse::success(null, $this->tr('تمت أرشفة المستودع وإيقاف رابطه.', 'Repository archived and its link disabled.'));
    }

    public function publicShow(Request $request, string $token): JsonResponse
    {
        $repository = $this->findPublicRepository($token);
        $repository->forceFill(['last_accessed_at' => now()])->saveQuietly();
        $repository->increment('access_count');

        return ApiResponse::success([
            'title' => $repository->title,
            'description' => $repository->description,
            'expires_at' => $repository->expires_at,
            'allow_download' => $repository->allow_download,
            'meetings' => $repository->meetings->map(fn ($meeting) => [
                'id' => $meeting->id,
                'minutes_number' => $meeting->minutes_number,
                'meeting_type' => $meeting->meeting_type,
                'meeting_date' => $meeting->meeting_date,
                'agenda' => $meeting->agenda,
                'discussion_summary' => $meeting->discussion_summary,
                'decisions_summary' => $meeting->decisions_summary,
            ])->values(),
            'files' => $repository->files->map(fn ($file) => [
                'id' => $file->id,
                'original_name' => $file->original_name,
                'mime_type' => $file->mime_type,
                'file_size' => $file->file_size,
            ])->values(),
        ]);
    }

    public function publicFile(Request $request, string $token, MeetingRepositoryFile $file)
    {
        $repository = $this->findPublicRepository($token);
        $this->ensureFile($repository, $file);
        $previewable = $file->mime_type === 'application/pdf' || str_starts_with($file->mime_type, 'image/');
        abort_if(! $repository->allow_download && ! $previewable, 403);

        AuditLog::create([
            'user_id' => null,
            'action' => 'meeting_repository.public_file_accessed',
            'entity_type' => MeetingRepository::class,
            'entity_id' => $repository->id,
            'changes' => ['file_id' => $file->id, 'download' => $request->boolean('download')],
        ]);
        if ($request->boolean('download')) {
            abort_unless($repository->allow_download, 403);

            return Storage::disk('local')->download($file->stored_path, $file->original_name);
        }

        return Storage::disk('local')->response($file->stored_path, $file->original_name, [
            'Content-Type' => $file->mime_type,
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function detail(MeetingRepository $repository): MeetingRepository
    {
        $repository->load(['meetings:id,minutes_number,meeting_type,meeting_date,status', 'files.uploader.person', 'creator.person']);
        $repository->setAttribute('public_path', '/shared/meeting-repositories/'.$repository->share_token);

        return $repository;
    }

    private function findPublicRepository(string $token): MeetingRepository
    {
        abort_unless(strlen($token) === 64, 404);
        $repository = MeetingRepository::query()
            ->where('share_token_hash', hash('sha256', $token))
            ->where('is_active', true)
            ->with(['meetings', 'files'])
            ->firstOrFail();
        abort_if($repository->expires_at?->isPast(), 410);

        return $repository;
    }

    private function ensureFile(MeetingRepository $repository, MeetingRepositoryFile $file): void
    {
        abort_unless($file->meeting_repository_id === $repository->id && Storage::disk('local')->exists($file->stored_path), 404);
    }

    private function rules(bool $partial = false): array
    {
        $sometimes = $partial ? ['sometimes'] : [];

        return [
            'title' => [...$sometimes, 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'meeting_ids' => ['sometimes', 'array', 'max:50'],
            'meeting_ids.*' => ['integer', 'distinct', Rule::exists('meetings', 'id')->where('status', 'approved')],
            'is_active' => ['sometimes', 'boolean'],
            'allow_download' => ['sometimes', 'boolean'],
            'expires_at' => ['nullable', 'date', 'after:now'],
        ];
    }

    private function audit(Request $request, MeetingRepository $repository, string $action, array $changes = []): void
    {
        AuditLog::create([
            'user_id' => $request->user()?->id,
            'action' => $action,
            'entity_type' => MeetingRepository::class,
            'entity_id' => $repository->id,
            'changes' => $changes,
        ]);
    }

    private function tr(string $ar, string $en): string
    {
        return app()->getLocale() === 'ar' ? $ar : $en;
    }
}

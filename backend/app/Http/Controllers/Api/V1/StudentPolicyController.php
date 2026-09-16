<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\V1\StudentPolicyCampaignResource;
use App\Http\Responses\ApiResponse;
use App\Models\AuditLog;
use App\Models\AcademicYear;
use App\Models\StudentPolicyAssignment;
use App\Models\StudentPolicyCampaign;
use App\Models\StudentPolicyDocument;
use App\Services\SecureFileUploadService;
use App\Services\StudentPolicyCampaignService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class StudentPolicyController extends Controller
{
    public function index(): JsonResponse
    {
        $campaigns = $this->campaignQuery()->latest()->get();
        return ApiResponse::success(StudentPolicyCampaignResource::collection($campaigns));
    }

    public function options(): JsonResponse
    {
        return ApiResponse::success([
            'academic_years' => AcademicYear::query()
                ->orderByDesc('start_date')
                ->get(['id', 'code', 'is_current']),
        ]);
    }

    public function storeDocument(Request $request, SecureFileUploadService $files): JsonResponse
    {
        $data = $request->validate([
            'title_ar' => ['required', 'string', 'max:200'], 'title_en' => ['required', 'string', 'max:200'],
            'version_label' => ['required', 'string', 'max:50', 'unique:student_policy_documents,version_label'],
            'effective_date' => ['required', 'date'], 'file' => ['required', 'file', 'mimes:pdf', 'max:10240'],
        ]);
        $stored = $files->storeDocument($request->file('file'), 'student-policies/documents');
        abort_unless($stored['mime_type'] === 'application/pdf', 422, 'يجب رفع ملف PDF معتمد.');
        unset($data['file']);
        $document = StudentPolicyDocument::create([
            ...$data, 'storage_path' => $stored['storage_path'], 'original_name' => $request->file('file')->getClientOriginalName(),
            'mime_type' => $stored['mime_type'], 'size_bytes' => $stored['size_bytes'],
            'sha256' => hash_file('sha256', Storage::disk('local')->path($stored['storage_path'])), 'uploaded_by' => $request->user()->id,
        ]);
        return ApiResponse::success($document, 'تم حفظ النسخة الرسمية.', [], 201);
    }

    public function storeCampaign(Request $request): JsonResponse
    {
        $data = $request->validate([
            'student_policy_document_id' => ['required', 'exists:student_policy_documents,id'],
            'academic_year_id' => ['required', 'exists:academic_years,id'],
            'target_levels' => ['required', 'array', 'min:1'], 'target_levels.*' => ['required', Rule::in(['fourth', 'fifth', 'sixth'])],
            'deadline' => ['required', 'date'],
        ]);
        $campaign = StudentPolicyCampaign::create([...$data, 'status' => 'draft', 'created_by' => $request->user()->id]);
        return ApiResponse::success(new StudentPolicyCampaignResource($campaign->load(['document', 'academicYear', 'assignments'])), 'تم إنشاء الحملة كمسودة.', [], 201);
    }

    public function show(Request $request, StudentPolicyCampaign $campaign): JsonResponse
    {
        $campaign = $this->campaignQuery()->findOrFail($campaign->id);
        $query = $campaign->assignments()->with('student')->when($request->filled('search'), function ($q) use ($request) {
            $search = trim((string) $request->input('search'));
            $q->whereHas('student', fn ($s) => $s->where('full_name_ar', 'like', "%{$search}%")->orWhere('full_name_en', 'like', "%{$search}%")->orWhere('university_number', 'like', "%{$search}%"));
        })->when($request->filled('level'), fn ($q) => $q->whereHas('student', fn ($s) => $s->where('academic_level', $request->input('level'))));
        if ($request->filled('milestone')) {
            match ($request->input('milestone')) {
                'not_opened' => $query->whereNull('opened_at'), 'opened' => $query->whereNotNull('opened_at')->whereNull('acknowledged_at'),
                'acknowledged' => $query->whereNotNull('acknowledged_at'), 'paper_received' => $query->whereNotNull('paper_received_at'),
                'scan_attached' => $query->whereNotNull('scan_storage_path'), default => null,
            };
        }
        $assignments = $query->orderBy('student_id')->paginate(min(2000, max(20, $request->integer('per_page', 100))));
        $assignments->getCollection()->transform(fn ($a) => $this->assignmentData($a));
        return ApiResponse::success(['campaign' => new StudentPolicyCampaignResource($campaign), 'assignments' => $assignments]);
    }

    public function publish(Request $request, StudentPolicyCampaign $campaign, StudentPolicyCampaignService $service): JsonResponse
    {
        return ApiResponse::success(new StudentPolicyCampaignResource($service->publish($campaign, $request->user())), 'تم نشر الحملة وإنشاء سجل متابعة ثابت للطلبة.');
    }

    public function document(StudentPolicyCampaign $campaign): BinaryFileResponse
    {
        $campaign->loadMissing('document');
        abort_unless(Storage::disk('local')->exists($campaign->document->storage_path), 404);
        return response()->file(Storage::disk('local')->path($campaign->document->storage_path), [
            'Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="code-of-conduct.pdf"',
            'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function close(Request $request, StudentPolicyCampaign $campaign): JsonResponse
    {
        abort_if($campaign->status !== 'published', 409, 'الحملة ليست منشورة.');
        $campaign->update(['status' => 'closed', 'closed_at' => now(), 'closed_by' => $request->user()->id]);
        $this->audit($request, 'student_policy.closed', $campaign->id);
        return ApiResponse::success(new StudentPolicyCampaignResource($campaign->fresh()->load(['document', 'academicYear', 'assignments'])), 'تم إغلاق الحملة.');
    }

    public function recordExport(Request $request, StudentPolicyCampaign $campaign): JsonResponse
    {
        $this->audit($request, 'student_policy.register_exported', $campaign->id, ['filters' => $request->only(['search', 'level', 'milestone'])]);
        return ApiResponse::success(null, 'تم توثيق تصدير سجل المتابعة.');
    }

    public function paperReceipt(Request $request, StudentPolicyAssignment $assignment): JsonResponse
    {
        $assignment = DB::transaction(function () use ($assignment, $request) {
            $locked = StudentPolicyAssignment::lockForUpdate()->findOrFail($assignment->id);
            $locked->update(['paper_received_at' => $locked->paper_received_at ?: now(), 'paper_received_by' => $request->user()->id]);
            return $locked;
        });
        $this->audit($request, 'student_policy.paper_received', $assignment->id);
        return ApiResponse::success($this->assignmentData($assignment->load('student')), 'تم تسجيل استلام النسخة الورقية.');
    }

    public function bulkPaperReceipt(Request $request): JsonResponse
    {
        $data = $request->validate(['assignment_ids' => ['required', 'array', 'min:1', 'max:500'], 'assignment_ids.*' => ['integer', 'exists:student_policy_assignments,id']]);
        $count = StudentPolicyAssignment::whereIn('id', $data['assignment_ids'])->whereNull('paper_received_at')->update(['paper_received_at' => now(), 'paper_received_by' => $request->user()->id, 'updated_at' => now()]);
        $this->audit($request, 'student_policy.paper_received_bulk', 0, ['assignment_ids' => $data['assignment_ids'], 'updated' => $count]);
        return ApiResponse::success(['updated' => $count], 'تم تسجيل الاستلام للطلبة المحددين.');
    }

    public function uploadScan(Request $request, StudentPolicyAssignment $assignment, SecureFileUploadService $files): JsonResponse
    {
        $request->validate(['file' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:10240']]);
        $stored = $files->storeDocument($request->file('file'), "student-policy-scans/{$assignment->campaign_id}/{$assignment->student_id}");
        $oldPath = $assignment->scan_storage_path;
        $assignment->update(['scan_storage_path' => $stored['storage_path'], 'scan_original_name' => $request->file('file')->getClientOriginalName(),
            'scan_mime_type' => $stored['mime_type'], 'scan_size_bytes' => $stored['size_bytes'],
            'scan_sha256' => hash_file('sha256', Storage::disk('local')->path($stored['storage_path'])), 'scan_uploaded_at' => now(), 'scan_uploaded_by' => $request->user()->id]);
        if ($oldPath && $oldPath !== $stored['storage_path']) Storage::disk('local')->delete($oldPath);
        $this->audit($request, 'student_policy.scan_uploaded', $assignment->id);
        return ApiResponse::success($this->assignmentData($assignment->load('student')), 'تم حفظ النسخة الموقعة بخصوصية.', [], 201);
    }

    public function downloadScan(Request $request, StudentPolicyAssignment $assignment): BinaryFileResponse
    {
        abort_unless($assignment->scan_storage_path && Storage::disk('local')->exists($assignment->scan_storage_path), 404);
        $this->audit($request, 'student_policy.scan_downloaded', $assignment->id);
        return response()->download(Storage::disk('local')->path($assignment->scan_storage_path), $assignment->scan_original_name ?: 'signed-conduct.pdf', ['Content-Type' => $assignment->scan_mime_type, 'X-Content-Type-Options' => 'nosniff', 'Cache-Control' => 'private, no-store']);
    }

    public function deleteScan(Request $request, StudentPolicyAssignment $assignment): JsonResponse
    {
        if ($assignment->scan_storage_path) Storage::disk('local')->delete($assignment->scan_storage_path);
        $assignment->update(['scan_storage_path' => null, 'scan_original_name' => null, 'scan_mime_type' => null, 'scan_size_bytes' => null, 'scan_sha256' => null, 'scan_uploaded_at' => null, 'scan_uploaded_by' => null]);
        $this->audit($request, 'student_policy.scan_removed', $assignment->id);
        return ApiResponse::success(null, 'تم حذف النسخة المرفوعة.');
    }

    private function assignmentData(StudentPolicyAssignment $a): array
    {
        return ['id' => $a->id, 'student' => ['id' => $a->student?->id, 'university_number' => $a->student?->university_number, 'full_name_ar' => $a->student?->full_name_ar, 'full_name_en' => $a->student?->full_name_en, 'academic_level' => $a->student?->academic_level],
            'opened_at' => $a->opened_at?->toIso8601String(), 'acknowledged_at' => $a->acknowledged_at?->toIso8601String(),
            'paper_received_at' => $a->paper_received_at?->toIso8601String(), 'scan_attached' => (bool) $a->scan_storage_path,
            'scan_name' => $a->scan_original_name, 'scan_download_url' => $a->scan_storage_path ? url("/api/v1/student-policies/assignments/{$a->id}/scan") : null];
    }

    private function campaignQuery()
    {
        return StudentPolicyCampaign::query()->with(['document', 'academicYear'])->withCount([
            'assignments',
            'assignments as not_opened_count' => fn ($q) => $q->whereNull('opened_at'),
            'assignments as opened_only_count' => fn ($q) => $q->whereNotNull('opened_at')->whereNull('acknowledged_at'),
            'assignments as acknowledged_count' => fn ($q) => $q->whereNotNull('acknowledged_at'),
            'assignments as paper_received_count' => fn ($q) => $q->whereNotNull('paper_received_at'),
            'assignments as scan_attached_count' => fn ($q) => $q->whereNotNull('scan_storage_path'),
        ]);
    }

    private function audit(Request $request, string $action, int $id, array $changes = []): void
    {
        AuditLog::create(['user_id' => $request->user()?->id, 'action' => $action, 'entity_type' => 'student_policy', 'entity_id' => $id, 'changes' => $changes]);
    }
}

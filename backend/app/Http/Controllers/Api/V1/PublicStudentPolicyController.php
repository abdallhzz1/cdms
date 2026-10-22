<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\StudentPolicyCampaign;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class PublicStudentPolicyController extends Controller
{
    public function show(StudentPolicyCampaign $campaign): JsonResponse
    {
        $campaign->load(['document', 'academicYear']);

        return ApiResponse::success([
            'public_id' => $campaign->public_id,
            'status' => $campaign->status,
            'deadline' => $campaign->deadline?->toDateString(),
            'academic_year' => $campaign->academicYear?->code,
            'title_ar' => $campaign->document->title_ar,
            'title_en' => $campaign->document->title_en,
            'version_label' => $campaign->document->version_label,
            'has_english_document' => filled($campaign->document->storage_path_en),
        ]);
    }

    public function document(Request $request, StudentPolicyCampaign $campaign): BinaryFileResponse
    {
        abort_unless($campaign->status === 'published', 404);
        $campaign->loadMissing('document');
        $english = $request->query('language') === 'en';
        $path = $english ? $campaign->document->storage_path_en : $campaign->document->storage_path;
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        return response()->download(Storage::disk('local')->path($path), 'student-policy-'.($english ? 'en' : 'ar').'.pdf', [
            'Content-Type' => 'application/pdf',
            'Cache-Control' => 'no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}

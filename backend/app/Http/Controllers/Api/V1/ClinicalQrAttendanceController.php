<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ClinicalQrAttendanceRoster;
use App\Models\ClinicalQrAttendanceSession;
use App\Services\ClinicalAttendance\QrAttendanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ClinicalQrAttendanceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $personId = $request->user()->person?->id;
        $sessions = ClinicalQrAttendanceSession::with(['roster.student', 'trainingSite', 'assignment.studentSubgroup.group'])
            ->where('supervisor_id', $personId)->latest('session_date')->latest('id')->limit(30)->get();
        return ApiResponse::success($sessions);
    }

    public function store(Request $request, QrAttendanceService $service): JsonResponse
    {
        $data = $request->validate(['assignment_id' => ['required', 'integer', 'exists:student_clinical_assignments,id'], 'session_date' => ['required', 'date']]);
        $session = $service->open($request->user(), (int) $data['assignment_id'], $data['session_date']);
        return ApiResponse::success($session, 'تم فتح تسجيل الدخول. اعرض رمز QR للطلبة.', [], 201);
    }

    public function show(Request $request, ClinicalQrAttendanceSession $session): JsonResponse
    {
        abort_unless((int) $session->supervisor_id === (int) $request->user()->person?->id || $request->user()->can('permission', ['attendance.review']), 403);
        return ApiResponse::success($session->load(['roster.student', 'trainingSite', 'assignment.studentSubgroup.group']));
    }

    public function transition(Request $request, ClinicalQrAttendanceSession $session, QrAttendanceService $service): JsonResponse
    {
        $data = $request->validate(['action' => ['required', Rule::in(['close_check_in', 'reopen_check_in', 'open_check_out', 'close_check_out', 'finalize'])], 'reason' => ['nullable', 'string', 'max:2000']]);
        return ApiResponse::success($service->transition($request->user(), $session, $data['action'], $data['reason'] ?? null));
    }

    public function qr(Request $request, ClinicalQrAttendanceSession $session, QrAttendanceService $service): JsonResponse
    {
        abort_unless((int) $session->supervisor_id === (int) $request->user()->person?->id, 403);
        return ApiResponse::success($service->payload($session));
    }

    public function override(Request $request, ClinicalQrAttendanceSession $session, ClinicalQrAttendanceRoster $roster, QrAttendanceService $service): JsonResponse
    {
        $data = $request->validate(['status' => ['required', Rule::in(['present', 'absent', 'late', 'excused'])], 'reason' => ['required', 'string', 'min:2', 'max:2000'], 'check_in_at' => ['nullable', 'date'], 'check_out_at' => ['nullable', 'date']]);
        return ApiResponse::success($service->override($request->user(), $session, $roster, $data), 'تم حفظ التعديل مع سبب موثق.');
    }
}

<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    private const SENSITIVE_KEY_PARTS = ['password', 'secret', 'token', 'remember'];

    private function sanitizeValue(mixed $value, ?string $key = null): mixed
    {
        if ($key !== null && collect(self::SENSITIVE_KEY_PARTS)->contains(fn ($part) => str_contains(strtolower($key), $part))) {
            return '********';
        }

        if (!is_array($value)) {
            return $value;
        }

        foreach ($value as $childKey => $childValue) {
            $value[$childKey] = $this->sanitizeValue($childValue, (string) $childKey);
        }

        return $value;
    }

    private function sanitize(AuditLog $auditLog): AuditLog
    {
        $auditLog->setAttribute('changes', $this->sanitizeValue($auditLog->changes ?? []));
        return $auditLog;
    }

    private function applyFilters($query, Request $request)
    {
        return $query
            ->when($request->filled('action'), fn($q) => $q->where('action', $request->string('action')))
            ->when($request->filled('entity_type'), fn($q) => $q->where('entity_type', $request->string('entity_type')))
            ->when($request->filled('user_id'), fn($q) => $q->where('user_id', $request->integer('user_id')))
            ->when($request->filled('date_from'), fn($q) => $q->whereDate('created_at', '>=', $request->date('date_from')))
            ->when($request->filled('date_to'), fn($q) => $q->whereDate('created_at', '<=', $request->date('date_to')))
            ->when($request->filled('search'), fn($q) => $q->where('action', 'LIKE', '%' . $request->string('search') . '%'));
    }

    public function index(Request $request): JsonResponse
    {
        $query = AuditLog::with('user:id,name,email')->latest();
        $this->applyFilters($query, $request);
        
        $items = $query->paginate($request->integer('per_page', 100));
        
        return ApiResponse::success(collect($items->items())->map(fn (AuditLog $log) => $this->sanitize($log))->values(), null, ['total' => $items->total()]);
    }

    public function show(AuditLog $auditLog): JsonResponse
    {
        $auditLog->load('user:id,name,email');
        
        return ApiResponse::success($this->sanitize($auditLog));
    }

    public function export(Request $request)
    {
        $query = AuditLog::with('user:id,name')->latest();
        $this->applyFilters($query, $request);
        $rows = $query->get();

        $callback = function () use ($rows) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, ['ID', 'Action', 'Entity', 'Entity ID', 'User', 'Timestamp']);
            foreach ($rows as $row) {
                fputcsv($out, [
                    $row->id,
                    $row->action,
                    $row->entity_type,
                    $row->entity_id,
                    $row->user?->name,
                    $row->created_at
                ]);
            }
            fclose($out);
        };

        return response()->streamDownload($callback, 'audit-log.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }
}

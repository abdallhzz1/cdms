<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StudentPolicyCampaignResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $counts = isset($this->assignments_count) ? [
            'total' => (int) $this->assignments_count,
            'not_opened' => (int) $this->not_opened_count,
            'opened' => (int) $this->opened_only_count,
            'acknowledged' => (int) $this->acknowledged_count,
            'paper_received' => (int) $this->paper_received_count,
            'scan_attached' => (int) $this->scan_attached_count,
        ] : ($this->relationLoaded('assignments') ? [
            'total' => $this->assignments->count(),
            'not_opened' => $this->assignments->whereNull('opened_at')->count(),
            'opened' => $this->assignments->whereNotNull('opened_at')->whereNull('acknowledged_at')->count(),
            'acknowledged' => $this->assignments->whereNotNull('acknowledged_at')->count(),
            'paper_received' => $this->assignments->whereNotNull('paper_received_at')->count(),
            'scan_attached' => $this->assignments->whereNotNull('scan_storage_path')->count(),
        ] : []);

        return [
            'id' => $this->id, 'public_id' => $this->public_id, 'status' => $this->status,
            'target_levels' => $this->target_levels, 'deadline' => $this->deadline?->toDateString(),
            'published_at' => $this->published_at?->toIso8601String(), 'closed_at' => $this->closed_at?->toIso8601String(),
            'document' => $this->whenLoaded('document', fn () => [
                'id' => $this->document->id, 'title_ar' => $this->document->title_ar, 'title_en' => $this->document->title_en,
                'version_label' => $this->document->version_label, 'effective_date' => $this->document->effective_date?->toDateString(),
            ]),
            'academic_year' => $this->whenLoaded('academicYear', fn () => ['id' => $this->academicYear->id, 'code' => $this->academicYear->code]),
            'counts' => (object) $counts,
        ];
    }
}

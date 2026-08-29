<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:50'],
            'unread' => ['sometimes', 'boolean'],
            'category' => ['sometimes', 'string', 'max:50'],
        ]);

        $query = $request->user()->notifications()->latest();

        if ($request->boolean('unread')) {
            $query->whereNull('read_at');
        }

        if (! empty($validated['category'])) {
            $query->where('data->category', $validated['category']);
        }

        $notifications = $query->paginate($validated['per_page'] ?? 15);

        return ApiResponse::success(
            collect($notifications->items())->map(fn (DatabaseNotification $notification) => $this->serialize($notification))->values(),
            null,
            [
                'current_page' => $notifications->currentPage(),
                'last_page' => $notifications->lastPage(),
                'per_page' => $notifications->perPage(),
                'total' => $notifications->total(),
                'unread_count' => $request->user()->unreadNotifications()->count(),
            ],
        );
    }

    public function unreadCount(Request $request): JsonResponse
    {
        return ApiResponse::success([
            'count' => $request->user()->unreadNotifications()->count(),
        ]);
    }

    public function markRead(Request $request, string $notification): JsonResponse
    {
        /** @var DatabaseNotification $item */
        $item = $request->user()->notifications()->whereKey($notification)->firstOrFail();
        $item->markAsRead();

        return ApiResponse::success($this->serialize($item->fresh()), 'Notification marked as read.');
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $count = $request->user()->unreadNotifications()->count();
        $request->user()->unreadNotifications()->update(['read_at' => now()]);

        return ApiResponse::success(['marked_count' => $count], 'All notifications marked as read.');
    }

    private function serialize(DatabaseNotification $notification): array
    {
        $data = $notification->data;

        return [
            'id' => $notification->id,
            'event_key' => $data['event_key'] ?? class_basename($notification->type),
            'category' => $data['category'] ?? $this->legacyCategory($data),
            'severity' => $data['severity'] ?? 'info',
            'title_ar' => $data['title_ar'] ?? $data['title'] ?? 'إشعار جديد',
            'title_en' => $data['title_en'] ?? $data['title'] ?? 'New notification',
            'message_ar' => $data['message_ar'] ?? '',
            'message_en' => $data['message_en'] ?? '',
            'action_url' => $data['action_url'] ?? $this->legacyActionUrl($data),
            'entity_type' => $data['entity_type'] ?? $data['type'] ?? null,
            'entity_id' => $data['entity_id'] ?? $data['id'] ?? null,
            'actor_name' => $data['actor_name'] ?? null,
            'read_at' => $notification->read_at?->toISOString(),
            'created_at' => $notification->created_at?->toISOString(),
        ];
    }

    private function legacyCategory(array $data): string
    {
        if (isset($data['distribution_version_id'])) {
            return 'distribution';
        }

        return ($data['type'] ?? null) === 'task' ? 'tasks' : 'correspondence';
    }

    private function legacyActionUrl(array $data): ?string
    {
        if (($data['type'] ?? null) === 'task' && isset($data['id'])) {
            return '/tasks';
        }
        if (($data['type'] ?? null) === 'correspondence' && isset($data['id'])) {
            return '/correspondence/'.$data['id'];
        }
        if (isset($data['distribution_version_id'])) {
            return '/distribution';
        }

        return null;
    }
}

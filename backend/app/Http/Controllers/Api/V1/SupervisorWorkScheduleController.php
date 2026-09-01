<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Person;
use App\Models\SupervisorAvailability;
use App\Models\TrainingSite;
use App\Models\User;
use App\Services\SupervisorWorkScheduleService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SupervisorWorkScheduleController extends Controller
{
    public function __construct(private readonly SupervisorWorkScheduleService $schedules) {}

    public function show(User $user): JsonResponse
    {
        $person = $this->person($user);
        return ApiResponse::success(['person_id' => $person->id, 'schedules' => $this->schedules->schedules($person)]);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'schedules' => ['array', 'max:50'],
            'schedules.*.training_site_id' => ['required', 'integer', 'exists:training_sites,id'],
            'schedules.*.is_primary' => ['sometimes', 'boolean'],
            'schedules.*.valid_from' => ['required', 'date'],
            'schedules.*.valid_until' => ['required', 'date'],
            'schedules.*.days' => ['required', 'array', 'min:1', 'max:7'],
            'schedules.*.days.*.day' => ['required', Rule::in(SupervisorWorkScheduleService::DAYS)],
            'schedules.*.days.*.status' => ['required', Rule::in(['work', 'leave', 'unavailable'])],
            'schedules.*.days.*.note' => ['nullable', 'string', 'max:500'],
        ]);
        $person = $this->person($user);
        $schedules = collect($data['schedules'] ?? []);
        foreach ($schedules as $index => $schedule) {
            if (Carbon::parse($schedule['valid_until'])->lt(Carbon::parse($schedule['valid_from']))) {
                throw ValidationException::withMessages(["schedules.$index.valid_until" => ['تاريخ النهاية يجب أن يكون مساويًا لتاريخ البداية أو بعده.']]);
            }
            if (collect($schedule['days'])->pluck('day')->duplicates()->isNotEmpty()) {
                throw ValidationException::withMessages(["schedules.$index.days" => ['لا يجوز تكرار اليوم داخل ارتباط العمل نفسه.']]);
            }
        }
        if ($schedules->where('is_primary', true)->count() > 1) {
            throw ValidationException::withMessages(['schedules' => ['يمكن تحديد مستشفى رئيسي واحد فقط.']]);
        }
        $this->validateWorkConflicts($schedules);
        $siteIds = $schedules->pluck('training_site_id')->map(fn ($id) => (int) $id)->unique()->values();
        $inactive = TrainingSite::whereIn('id', $siteIds)->where('is_active', false)->exists();
        if ($inactive) throw ValidationException::withMessages(['schedules' => ['أحد المواقع التدريبية المحددة غير فعال.']]);

        DB::transaction(function () use ($person, $schedules, $siteIds) {
            $person->availabilities()->delete();
            foreach ($schedules as $schedule) {
                foreach ($schedule['days'] as $day) {
                    SupervisorAvailability::create([
                        'person_id' => $person->id,
                        'training_site_id' => $schedule['training_site_id'],
                        'available_from' => $schedule['valid_from'],
                        'available_until' => $schedule['valid_until'],
                        'day' => $day['day'],
                        'status' => $day['status'],
                        'reason' => $day['status'] !== 'work' ? ($day['note'] ?? null) : null,
                        'notes' => $day['note'] ?? null,
                    ]);
                }
            }
            $primary = $schedules->firstWhere('is_primary', true)['training_site_id'] ?? $siteIds->first();
            $person->update(['primary_site_id' => $primary]);
            $person->trainingSites()->sync($siteIds->mapWithKeys(fn ($id) => [$id => ['is_primary' => (int) $id === (int) $primary]])->all());
        });

        return ApiResponse::success(['person_id' => $person->id, 'schedules' => $this->schedules->schedules($person->fresh())], 'تم حفظ أماكن وأيام عمل المشرف.');
    }

    private function validateWorkConflicts($schedules): void
    {
        $work = [];
        foreach ($schedules as $index => $schedule) {
            foreach ($schedule['days'] as $day) {
                if ($day['status'] !== 'work') continue;
                foreach ($work[$day['day']] ?? [] as $existing) {
                    $overlaps = Carbon::parse($schedule['valid_from'])->lte(Carbon::parse($existing['until']))
                        && Carbon::parse($schedule['valid_until'])->gte(Carbon::parse($existing['from']));
                    if ($overlaps && (int) $schedule['training_site_id'] !== (int) $existing['site']) {
                        throw ValidationException::withMessages(["schedules.$index.days" => ['لا يمكن تسجيل الطبيب في مستشفيين في يوم العمل نفسه ضمن فترات متداخلة.']]);
                    }
                }
                $work[$day['day']][] = ['site' => $schedule['training_site_id'], 'from' => $schedule['valid_from'], 'until' => $schedule['valid_until']];
            }
        }
    }

    private function person(User $user): Person
    {
        abort_unless($user->hasRole('CLINICAL_SUPERVISOR'), 404);
        return Person::where('user_id', $user->id)->firstOrFail();
    }
}

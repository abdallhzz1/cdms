<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ClinicalFieldForm;
use App\Models\Course;
use App\Models\Department;
use App\Models\StudentClinicalAssignment;
use App\Models\TrainingSite;
use App\Models\User;
use App\Notifications\LocalSystemNotification;
use App\Services\ClinicalFieldFormSchema;
use App\Services\Distribution\ClinicalScheduleQueryService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

class ClinicalFieldMonitoringController extends Controller
{
    public function __construct(private readonly ClinicalScheduleQueryService $scheduleQueryService) {}

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'mailbox' => ['sometimes', Rule::in(['all', 'outgoing', 'incoming'])],
            'status' => ['sometimes', 'nullable', Rule::in(['draft', 'submitted', 'acknowledged', 'action_required', 'returned_for_revision', 'completed'])],
            'type' => ['sometimes', 'nullable', Rule::in(ClinicalFieldFormSchema::TYPES)],
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ]);
        $user = $request->user();
        $mailbox = $validated['mailbox'] ?? 'all';
        $manage = $this->can($user, 'clinical_field_monitoring.manage');
        $deanReviewer = $user->hasRole('DEAN') || $user->hasRole('VICE_DEAN');

        $query = ClinicalFieldForm::query()->with($this->relations())->latest('updated_at');
        if (! $manage || $mailbox !== 'all') {
            $query->where(function (Builder $scope) use ($mailbox, $user, $deanReviewer) {
                if ($mailbox === 'outgoing') {
                    $scope->where('creator_user_id', $user->id);
                } elseif ($mailbox === 'incoming') {
                    $deanReviewer
                        ? $scope->where('type', ClinicalFieldFormSchema::DIRECTOR_SUPERVISORY_VISIT)
                        : $scope->where('recipient_user_id', $user->id);
                } else {
                    $scope->where('creator_user_id', $user->id)->orWhere('recipient_user_id', $user->id);
                    if ($deanReviewer) {
                        $scope->orWhere('type', ClinicalFieldFormSchema::DIRECTOR_SUPERVISORY_VISIT);
                    }
                }
            });
        }
        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }
        if (! empty($validated['type'])) {
            $query->where('type', $validated['type']);
        }
        if (! empty($validated['search'])) {
            $term = $validated['search'];
            $query->where(fn (Builder $q) => $q->where('reference_number', 'like', "%$term%")
                ->orWhereHas('creator', fn (Builder $u) => $u->where('name', 'like', "%$term%"))
                ->orWhereHas('recipient', fn (Builder $u) => $u->where('name', 'like', "%$term%")));
        }

        $forms = $query->paginate($validated['per_page'] ?? 20);

        return ApiResponse::success(
            collect($forms->items())->map(fn (ClinicalFieldForm $form) => $this->present($form, false))->values(),
            null,
            ['current_page' => $forms->currentPage(), 'last_page' => $forms->lastPage(), 'total' => $forms->total()],
        );
    }

    public function options(Request $request): JsonResponse
    {
        $user = $request->user();
        $types = collect(ClinicalFieldFormSchema::TYPES)->filter(fn (string $type) => $this->can($user, ClinicalFieldFormSchema::createPermission($type)))->values();
        $departmentIds = $this->scopedDepartmentIds($user);
        $global = $user->hasRole('CLINICAL_DIRECTOR') || $this->can($user, 'clinical_field_monitoring.manage');
        $departments = Department::query()->when(! $global, function (Builder $query) use ($departmentIds) {
            $departmentIds->isEmpty()
                ? $query->whereRaw('1 = 0')
                : $query->whereIn('id', $departmentIds);
        })
            ->orderBy('name_ar')->get(['id', 'name_ar', 'name_en']);

        $recipients = $types->mapWithKeys(function (string $type) {
            $recipient = $this->resolveRecipient($type, false);
            if (! $recipient) {
                return [$type => null];
            }
            $name = $type === ClinicalFieldFormSchema::DIRECTOR_SUPERVISORY_VISIT
                ? User::query()->where('is_active', true)->whereHas('roles', fn (Builder $query) => $query->whereIn('code', ['DEAN', 'VICE_DEAN']))->orderBy('id')->pluck('name')->join(' و ')
                : $recipient->name;

            return [$type => ['id' => $recipient->id, 'name' => $name ?: $recipient->name]];
        });

        return ApiResponse::success([
            'allowed_types' => $types,
            'recipients' => $recipients,
            'departments' => $departments,
            'training_sites' => TrainingSite::active()->orderBy('name_ar')->get(['id', 'name_ar', 'name_en']),
            'courses' => Course::query()->where('is_active', true)->orderBy('code')->get(['id', 'code', 'name_ar', 'name_en']),
            'creator' => ['id' => $user->id, 'name' => $user->name],
        ]);
    }

    public function context(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(ClinicalFieldFormSchema::TYPES)],
            'training_site_id' => ['nullable', 'integer', 'exists:training_sites,id'],
            'activity_date' => ['nullable', 'date_format:Y-m-d'],
            'period_from' => ['nullable', 'date_format:Y-m-d'],
            'period_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:period_from'],
        ]);
        $user = $request->user();
        $this->ensurePermission($user, ClinicalFieldFormSchema::createPermission($data['type']));

        if ($data['type'] !== ClinicalFieldFormSchema::DEPARTMENT_PERIODIC_REPORT) {
            if (empty($data['training_site_id']) || empty($data['activity_date'])) {
                throw ValidationException::withMessages(['activity_date' => ['Select a training site and visit date first.']]);
            }

            $groups = $this->dailyContextGroups($data['activity_date'], (int) $data['training_site_id']);
            $specialties = $this->specialtiesFromGroups($groups);

            return ApiResponse::success([
                'groups' => $groups,
                'specialties' => $specialties,
                'totals' => [
                    'groups' => $groups->count(),
                    'students' => $groups->sum('student_count'),
                    'supervisors' => $groups->pluck('supervisors')->flatten(1)->unique('id')->count(),
                ],
            ]);
        }

        if (empty($data['period_from']) || empty($data['period_to'])) {
            throw ValidationException::withMessages(['period_from' => ['Select the reporting period first.']]);
        }
        return ApiResponse::success($this->departmentPeriodContext($user, $data['period_from'], $data['period_to']));
    }

    public function show(Request $request, ClinicalFieldForm $clinicalFieldForm): JsonResponse
    {
        $this->ensureVisible($request->user(), $clinicalFieldForm);
        $clinicalFieldForm->load([...$this->relations(), 'events.user:id,name']);

        return ApiResponse::success($this->present($clinicalFieldForm, true));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatedForm($request);
        $this->ensurePermission($request->user(), ClinicalFieldFormSchema::createPermission($data['type']));
        $recipient = $this->resolveRecipient($data['type']);
        $payload = ClinicalFieldFormSchema::validate($data['type'], $data['payload']);
        $urgent = ClinicalFieldFormSchema::isUrgent($data['type'], $payload);

        $form = DB::transaction(function () use ($request, $data, $payload, $recipient, $urgent) {
            $publicId = (string) Str::uuid();
            $form = ClinicalFieldForm::create([
                ...$this->metadata($data), 'public_id' => $publicId,
                'reference_number' => 'CFM-'.now()->format('Y').'-'.strtoupper(substr(str_replace('-', '', $publicId), 0, 8)),
                'creator_user_id' => $request->user()->id, 'recipient_user_id' => $recipient->id,
                'payload' => $payload, 'is_urgent' => $urgent,
            ]);
            $this->event($form, $request->user(), 'created', null, 'draft');

            return $form->fresh();
        });

        return ApiResponse::success($this->present($form->load($this->relations()), true), 'Draft created.', [], 201);
    }

    public function update(Request $request, ClinicalFieldForm $clinicalFieldForm): JsonResponse
    {
        $this->ensureEditable($request->user(), $clinicalFieldForm);
        $data = $this->validatedForm($request, $clinicalFieldForm->type);
        $payload = ClinicalFieldFormSchema::validate($clinicalFieldForm->type, $data['payload']);
        $clinicalFieldForm->update([...$this->metadata($data), 'payload' => $payload, 'is_urgent' => ClinicalFieldFormSchema::isUrgent($clinicalFieldForm->type, $payload)]);
        $this->event($clinicalFieldForm, $request->user(), 'updated', $clinicalFieldForm->status, $clinicalFieldForm->status);

        return ApiResponse::success($this->present($clinicalFieldForm->fresh()->load($this->relations()), true), 'Draft saved.');
    }

    public function submit(Request $request, ClinicalFieldForm $clinicalFieldForm): JsonResponse
    {
        $this->ensureEditable($request->user(), $clinicalFieldForm);
        ClinicalFieldFormSchema::validate($clinicalFieldForm->type, $clinicalFieldForm->payload);
        $from = $clinicalFieldForm->status;
        $revision = $clinicalFieldForm->submitted_at ? $clinicalFieldForm->revision + 1 : $clinicalFieldForm->revision;
        $clinicalFieldForm->update(['status' => 'submitted', 'submitted_at' => now(), 'revision' => $revision, 'latest_review_note' => null]);
        $this->event($clinicalFieldForm, $request->user(), 'submitted', $from, 'submitted');
        $this->notifyReviewers($clinicalFieldForm, 'submitted');

        return ApiResponse::success($this->present($clinicalFieldForm->fresh()->load($this->relations()), true), 'Form submitted.');
    }

    public function review(Request $request, ClinicalFieldForm $clinicalFieldForm): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', Rule::in(['acknowledge', 'action_required', 'return', 'complete'])],
            'note' => ['nullable', 'string', 'max:4000', Rule::requiredIf(in_array($request->input('action'), ['action_required', 'return'], true))],
        ]);
        $this->ensureReviewer($request->user(), $clinicalFieldForm);
        $allowed = [
            'submitted' => ['acknowledge', 'action_required', 'return', 'complete'],
            'acknowledged' => ['action_required', 'return', 'complete'],
        ];
        if (! in_array($data['action'], $allowed[$clinicalFieldForm->status] ?? [], true)) {
            throw ValidationException::withMessages(['action' => ['This review action is not available for the current status.']]);
        }
        $target = match ($data['action']) {
            'acknowledge' => 'acknowledged', 'action_required' => 'action_required',
            'return' => 'returned_for_revision', default => 'completed',
        };
        $from = $clinicalFieldForm->status;
        $updates = ['status' => $target, 'latest_review_note' => $data['note'] ?? null];
        if ($target === 'acknowledged') {
            $updates['acknowledged_at'] = now();
        }
        if ($target === 'completed') {
            $updates['completed_at'] = now();
        }
        $clinicalFieldForm->update($updates);
        $this->event($clinicalFieldForm, $request->user(), $data['action'], $from, $target, $data['note'] ?? null);
        $this->notify($clinicalFieldForm->creator, $clinicalFieldForm, $data['action']);

        return ApiResponse::success($this->present($clinicalFieldForm->fresh()->load($this->relations()), true), 'Review decision saved.');
    }

    public function pdf(Request $request, ClinicalFieldForm $clinicalFieldForm): Response
    {
        $this->ensureVisible($request->user(), $clinicalFieldForm);
        $this->ensurePermission($request->user(), 'clinical_field_monitoring.export');
        $locale = $request->query('locale') === 'en' ? 'en' : 'ar';
        $clinicalFieldForm->load([...$this->relations(), 'events.user:id,name']);

        return Pdf::loadView('reports.clinical_field_form', ['form' => $clinicalFieldForm, 'locale' => $locale])
            ->setOption('defaultFont', 'DejaVu Sans')
            ->setOption('isHtml5ParserEnabled', true)
            ->setPaper('a4')
            ->download($clinicalFieldForm->reference_number.'-'.$locale.'.pdf');
    }

    private function validatedForm(Request $request, ?string $fixedType = null): array
    {
        $rules = [
            'type' => [$fixedType ? 'sometimes' : 'required', Rule::in(ClinicalFieldFormSchema::TYPES)],
            'locale' => ['required', Rule::in(['ar', 'en'])],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'training_site_id' => ['nullable', 'integer', 'exists:training_sites,id'],
            'course_id' => ['nullable', 'integer', 'exists:courses,id'],
            'activity_date' => ['nullable', 'date'], 'period_from' => ['nullable', 'date'],
            'period_to' => ['nullable', 'date', 'after_or_equal:period_from'],
            'payload' => ['required', 'array'],
        ];
        $data = $request->validate($rules);
        $data['type'] = $fixedType ?? $data['type'];
        $user = $request->user();

        if (empty($data['department_id']) && in_array($data['type'], [
            ClinicalFieldFormSchema::ASSISTANT_FOLLOW_UP,
            ClinicalFieldFormSchema::DEPARTMENT_PERIODIC_REPORT,
        ], true)) {
            $data['department_id'] = $this->scopedDepartmentIds($user)->first();
        }

        if ($data['type'] === ClinicalFieldFormSchema::ASSISTANT_FOLLOW_UP && (empty($data['training_site_id']) || empty($data['activity_date']))) {
            throw ValidationException::withMessages(['training_site_id' => ['Training site and visit date are required.']]);
        }
        if ($data['type'] === ClinicalFieldFormSchema::DEPARTMENT_PERIODIC_REPORT && empty($data['department_id'])) {
            throw ValidationException::withMessages(['department_id' => ['No clinical department is assigned to your account.']]);
        }
        if ($data['type'] === ClinicalFieldFormSchema::DEPARTMENT_PERIODIC_REPORT && (empty($data['period_from']) || empty($data['period_to']))) {
            throw ValidationException::withMessages(['period_from' => ['The reporting period is required.']]);
        }
        if ($data['type'] === ClinicalFieldFormSchema::DIRECTOR_SUPERVISORY_VISIT && (empty($data['training_site_id']) || empty($data['activity_date']))) {
            throw ValidationException::withMessages(['training_site_id' => ['Training site and visit date are required.']]);
        }

        // Schedule-backed assistant forms may legitimately include groups from
        // several clinical departments. Resolve those groups first and never
        // treat their department as a manual user selection.
        $this->hydrateScheduleContext($data, $user);

        $scopedRole = $user->hasRole('RTA') || $user->hasRole('DEPARTMENT_HEAD');
        $global = $user->hasRole('CLINICAL_DIRECTOR') || $this->can($user, 'clinical_field_monitoring.manage');
        $scheduleBackedAssistant = $data['type'] === ClinicalFieldFormSchema::ASSISTANT_FOLLOW_UP
            && ! empty($data['payload']['context']['schedule_group_keys']);
        if (! $global && $scopedRole && ! $scheduleBackedAssistant && ! empty($data['department_id']) && ! $this->scopedDepartmentIds($user)->contains((int) $data['department_id'])) {
            throw ValidationException::withMessages(['department_id' => ['The selected department is outside your assigned scope.']]);
        }

        return $data;
    }

    /** @return Collection<int, array<string, mixed>> */
    private function dailyContextGroups(string $date, int $trainingSiteId): Collection
    {
        return collect($this->scheduleQueryService->getDailyGroups($date, $trainingSiteId))
            ->map(function (array $group) {
                $supervisors = collect($group['supervisors'] ?? [])->map(fn (array $person) => [
                    'id' => $person['id'],
                    'name_ar' => $person['full_name_ar'] ?? null,
                    'name_en' => $person['full_name_en'] ?? null,
                ])->values()->all();

                return [
                    'key' => implode(':', [$group['rotation_id'], $group['group']['id'], $group['subgroup']['id']]),
                    'rotation_id' => $group['rotation_id'],
                    'course' => $group['course'],
                    'department' => $group['department'] ?? null,
                    'group' => $group['group'],
                    'subgroup' => $group['subgroup'],
                    'supervisors' => $supervisors,
                    'student_count' => count($group['students'] ?? []),
                ];
            })->values();
    }

    /** @param Collection<int, array<string, mixed>> $groups */
    private function specialtiesFromGroups(Collection $groups): Collection
    {
        return $groups->map(function (array $group) {
            $source = $group['department'] ?: $group['course'];
            if (! $source) return null;

            return [
                'code' => ($group['department'] ? 'department_' : 'course_').$source['id'],
                'name_ar' => $source['name_ar'] ?? $source['name'] ?? '',
                'name_en' => $source['name_en'] ?? $source['name_ar'] ?? $source['name'] ?? '',
            ];
        })->filter()->unique('code')->values();
    }

    /** @return array{department_id:int, summary:array<string, mixed>} */
    private function departmentPeriodContext(User $user, string $periodFrom, string $periodTo): array
    {
        $departmentId = $this->scopedDepartmentIds($user)->first();
        if (! $departmentId) {
            throw ValidationException::withMessages(['department_id' => ['No clinical department is assigned to your account.']]);
        }

        $assignments = app(\App\Services\DepartmentHeadCourseScope::class)
            ->assignments(StudentClinicalAssignment::query())
            ->where('student_clinical_assignments.department_id', $departmentId)
            ->whereHas('distributionVersion', fn (Builder $version) => $version
                ->where('status', 'published')->where('is_current', true))
            ->whereHas('rotationBlock.rotation', fn (Builder $rotation) => $rotation
                ->whereDate('start_date', '<=', $periodTo)
                ->where(fn (Builder $dates) => $dates->whereNull('end_date')->orWhereDate('end_date', '>=', $periodFrom)))
            ->with([
                'trainingSite:id,name_ar,name_en',
                'rotationBlock.rotation.course:id,code,name_ar,name_en',
            ])->get();

        $sites = $assignments->pluck('trainingSite')->filter()->unique('id')->values();
        $courses = $assignments->pluck('rotationBlock.rotation.course')->filter()->unique('id')->values();

        return [
            'department_id' => (int) $departmentId,
            'summary' => [
                'training_sites' => $sites->map(fn ($site) => $site->only('id', 'name_ar', 'name_en'))->values()->all(),
                'courses' => $courses->map(fn ($course) => $course->only('id', 'code', 'name_ar', 'name_en'))->values()->all(),
                'student_count' => $assignments->pluck('student_id')->unique()->count(),
                'supervisor_count' => $assignments->pluck('supervisor_id')->filter()->unique()->count(),
            ],
        ];
    }

    private function hydrateScheduleContext(array &$data, User $user): void
    {
        $locale = ($data['locale'] ?? 'ar') === 'en' ? 'en' : 'ar';
        $payload = $data['payload'];

        if ($data['type'] === ClinicalFieldFormSchema::ASSISTANT_FOLLOW_UP) {
            $keys = collect($payload['context']['schedule_group_keys'] ?? [])
                ->whenEmpty(fn (Collection $items) => ! empty($payload['context']['schedule_group_key'])
                    ? $items->push((string) $payload['context']['schedule_group_key'])
                    : $items)
                ->map(fn ($key) => (string) $key)->filter()->unique()->values();
            // Keep previously saved/manual drafts editable; every draft created by
            // the current UI carries schedule keys and is verified below.
            if ($keys->isEmpty()) {
                return;
            }
            $groups = $this->dailyContextGroups($data['activity_date'], (int) $data['training_site_id']);
            $selectedGroups = $groups->whereIn('key', $keys)->values();
            if ($selectedGroups->count() !== $keys->count()) {
                throw ValidationException::withMessages(['payload.context.schedule_group_keys' => ['One or more selected groups are not scheduled at this site on the visit date.']]);
            }

            $named = fn (?array $item) => $item
                ? ($locale === 'en' ? ($item['name_en'] ?? $item['name_ar'] ?? $item['name'] ?? '') : ($item['name_ar'] ?? $item['name'] ?? ''))
                : '';
            $courseIds = $selectedGroups->pluck('course.id')->filter()->unique()->values();
            $departmentIds = $selectedGroups->pluck('department.id')->filter()->unique()->values();
            $supervisors = $selectedGroups->pluck('supervisors')->flatten(1)->unique('id');
            $scheduleGroups = $selectedGroups->map(fn (array $group) => [
                'key' => $group['key'],
                'group' => $group['group']['name'],
                'subgroup' => $group['subgroup']['name'],
                'course' => $group['course'] ? trim(($group['course']['code'] ?? '').' · '.$named($group['course']), ' ·') : '',
                'specialty' => $named($group['department'] ?: $group['course']),
                'supervisors' => collect($group['supervisors'])->map(fn (array $person) => $locale === 'en'
                    ? ($person['name_en'] ?? $person['name_ar'] ?? '')
                    : ($person['name_ar'] ?? $person['name_en'] ?? ''))->filter()->values()->all(),
                'student_count' => $group['student_count'],
            ])->values()->all();

            $data['course_id'] = $courseIds->count() === 1 ? $courseIds->first() : null;
            $data['department_id'] = $departmentIds->count() === 1 ? $departmentIds->first() : null;
            $payload['context'] = [
                ...($payload['context'] ?? []),
                'schedule_group_keys' => $keys->all(),
                'schedule_groups' => $scheduleGroups,
                'clinical_specialty' => $selectedGroups->map(fn (array $group) => $named($group['department'] ?: $group['course']))->filter()->unique()->join('، '),
                'rotation_name' => $selectedGroups->pluck('course')->filter()->unique('id')->map(fn (array $course) => trim(($course['code'] ?? '').' · '.$named($course), ' ·'))->join('، '),
                'clinical_supervisor' => $supervisors->map(fn (array $person) => $locale === 'en'
                    ? ($person['name_en'] ?? $person['name_ar'] ?? '')
                    : ($person['name_ar'] ?? $person['name_en'] ?? ''))->filter()->join('، '),
                'student_group' => $selectedGroups->map(fn (array $group) => $group['group']['name'].' · '.$group['subgroup']['name'])->join('، '),
                'scheduled_students' => $selectedGroups->sum('student_count'),
                'students_present' => $selectedGroups->sum('student_count'),
                'students_absent' => 0,
                'attendance_source' => 'schedule',
            ];
            unset($payload['context']['schedule_group_key']);
        } elseif ($data['type'] === ClinicalFieldFormSchema::DEPARTMENT_PERIODIC_REPORT) {
            $context = $this->departmentPeriodContext($user, $data['period_from'], $data['period_to']);
            $data['department_id'] = $context['department_id'];
            $summary = $context['summary'];
            $payload['context'] = [
                ...($payload['context'] ?? []),
                'training_sites' => collect($summary['training_sites'])->map(fn (array $site) => $locale === 'en' ? ($site['name_en'] ?? $site['name_ar']) : $site['name_ar'])->join('، '),
                'courses_rotations' => collect($summary['courses'])->map(function (array $course) use ($locale) {
                    $name = $locale === 'en' ? ($course['name_en'] ?? $course['name_ar']) : $course['name_ar'];
                    return trim(($course['code'] ?? '').' · '.$name, ' ·');
                })->join('، '),
                'student_count' => $summary['student_count'],
                'supervisor_count' => $summary['supervisor_count'],
            ];
        } elseif ($data['type'] === ClinicalFieldFormSchema::DIRECTOR_SUPERVISORY_VISIT) {
            $groups = $this->dailyContextGroups($data['activity_date'], (int) $data['training_site_id']);
            $specialties = $this->specialtiesFromGroups($groups);
            if ($specialties->isEmpty()) {
                // Legacy drafts may predate schedule-backed forms. New forms cannot
                // reach this state because the UI derives their specialties here.
                return;
            }
            $existing = collect($payload['specialties'] ?? [])->keyBy('code');
            $payload['specialties'] = $specialties->map(function (array $specialty) use ($existing, $locale) {
                $saved = $existing->get($specialty['code'], []);
                return [
                    ...$saved,
                    ...$specialty,
                    'name' => $locale === 'en' ? $specialty['name_en'] : $specialty['name_ar'],
                    'rating' => $saved['rating'] ?? 'not_assessed',
                    'basis' => $saved['basis'] ?? '',
                    'notes' => $saved['notes'] ?? '',
                ];
            })->values()->all();
            $payload['context'] = [
                ...($payload['context'] ?? []),
                'scheduled_groups' => $groups->count(),
                'scheduled_students' => $groups->sum('student_count'),
                'scheduled_supervisors' => $groups->pluck('supervisors')->flatten(1)->unique('id')->count(),
            ];
        }

        $data['payload'] = $payload;
    }

    private function scopedDepartmentIds(User $user): Collection
    {
        $pivotIds = DB::table('user_roles')
            ->join('roles', 'roles.id', '=', 'user_roles.role_id')
            ->where('user_roles.user_id', $user->id)
            ->whereIn('roles.code', ['DEPARTMENT_HEAD', 'RTA'])
            ->where('user_roles.scope_type', 'department')
            ->whereNotNull('user_roles.scope_id')
            ->pluck('user_roles.scope_id');

        return collect([$user->person?->department_id, $user->departmentHeadProfile?->department_id])
            ->merge($pivotIds)->filter()->map(fn ($id) => (int) $id)->unique()->values();
    }

    private function metadata(array $data): array
    {
        return collect(['type', 'locale', 'department_id', 'training_site_id', 'course_id', 'activity_date', 'period_from', 'period_to'])
            ->mapWithKeys(fn (string $key) => [$key => $data[$key] ?? null])->all();
    }

    private function resolveRecipient(string $type, bool $fail = true): ?User
    {
        $roles = $type === ClinicalFieldFormSchema::DIRECTOR_SUPERVISORY_VISIT
            ? ['DEAN', 'VICE_DEAN']
            : [ClinicalFieldFormSchema::recipientRole($type)];
        $recipient = User::query()->where('is_active', true)->whereHas('roles', fn (Builder $q) => $q->whereIn('code', $roles))->orderBy('id')->first();
        if (! $recipient && $fail) {
            throw ValidationException::withMessages(['recipient' => ['No active recipient is configured for this form.']]);
        }

        return $recipient;
    }

    private function ensureVisible(User $user, ClinicalFieldForm $form): void
    {
        $this->ensurePermission($user, 'clinical_field_monitoring.view');
        if ($form->creator_user_id !== $user->id && $form->recipient_user_id !== $user->id && ! $this->isDeanReviewer($user, $form) && ! $this->can($user, 'clinical_field_monitoring.manage')) {
            abort(403);
        }
    }

    private function ensureEditable(User $user, ClinicalFieldForm $form): void
    {
        $this->ensureVisible($user, $form);
        if ($form->creator_user_id !== $user->id && ! $this->can($user, 'clinical_field_monitoring.manage')) {
            abort(403);
        }
        if (! in_array($form->status, ['draft', 'returned_for_revision', 'action_required'], true)) {
            abort(409, 'The form is not editable in its current status.');
        }
    }

    private function ensureReviewer(User $user, ClinicalFieldForm $form): void
    {
        $this->ensurePermission($user, 'clinical_field_monitoring.review');
        if ($form->recipient_user_id !== $user->id && ! $this->isDeanReviewer($user, $form) && ! $this->can($user, 'clinical_field_monitoring.manage')) {
            abort(403);
        }
    }

    private function isDeanReviewer(User $user, ClinicalFieldForm $form): bool
    {
        return $form->type === ClinicalFieldFormSchema::DIRECTOR_SUPERVISORY_VISIT
            && ($user->hasRole('DEAN') || $user->hasRole('VICE_DEAN'));
    }

    private function ensurePermission(User $user, string $permission): void
    {
        if (! $this->can($user, $permission) && ! $this->can($user, 'clinical_field_monitoring.manage')) {
            abort(403);
        }
    }

    private function can(User $user, string $permission): bool
    {
        return Gate::forUser($user)->allows('permission', [$permission]);
    }

    private function event(ClinicalFieldForm $form, User $user, string $action, ?string $from, ?string $to, ?string $note = null): void
    {
        $form->events()->create(['user_id' => $user->id, 'action' => $action, 'from_status' => $from, 'to_status' => $to, 'note' => $note]);
    }

    private function notify(User $recipient, ClinicalFieldForm $form, string $action): void
    {
        $urgent = $form->is_urgent;
        $titles = $action === 'submitted'
            ? ['نموذج متابعة ميدانية جديد', 'New field monitoring form']
            : ['تحديث على نموذج المتابعة الميدانية', 'Field monitoring form updated'];
        $recipient->notify(new LocalSystemNotification([
            'event_key' => 'clinical_field_form.'.$action, 'category' => 'clinical_field_monitoring',
            'severity' => $urgent ? 'critical' : 'info', 'title_ar' => $titles[0], 'title_en' => $titles[1],
            'message_ar' => ($urgent ? 'عاجل: ' : '').$form->reference_number,
            'message_en' => ($urgent ? 'Urgent: ' : '').$form->reference_number,
            'action_url' => '/clinical-field-monitoring?form='.$form->id,
            'entity_type' => 'clinical_field_form', 'entity_id' => $form->id,
        ]));
    }

    private function notifyReviewers(ClinicalFieldForm $form, string $action): void
    {
        if ($form->type !== ClinicalFieldFormSchema::DIRECTOR_SUPERVISORY_VISIT) {
            $this->notify($form->recipient, $form, $action);
            return;
        }

        User::query()->where('is_active', true)
            ->whereHas('roles', fn (Builder $query) => $query->whereIn('code', ['DEAN', 'VICE_DEAN']))
            ->get()->each(fn (User $reviewer) => $this->notify($reviewer, $form, $action));
    }

    private function relations(): array
    {
        return ['creator:id,name', 'recipient:id,name', 'department:id,name_ar,name_en', 'trainingSite:id,name_ar,name_en', 'course:id,code,name_ar,name_en'];
    }

    private function present(ClinicalFieldForm $form, bool $detail): array
    {
        $data = [
            'id' => $form->id, 'public_id' => $form->public_id, 'reference_number' => $form->reference_number,
            'type' => $form->type, 'status' => $form->status, 'revision' => $form->revision, 'locale' => $form->locale,
            'creator' => $form->creator, 'recipient' => $form->recipient, 'department' => $form->department,
            'training_site' => $form->trainingSite, 'course' => $form->course,
            'activity_date' => $form->activity_date?->toDateString(), 'period_from' => $form->period_from?->toDateString(),
            'period_to' => $form->period_to?->toDateString(), 'is_urgent' => $form->is_urgent,
            'latest_review_note' => $form->latest_review_note,
            'submitted_at' => $form->submitted_at?->toISOString(), 'acknowledged_at' => $form->acknowledged_at?->toISOString(),
            'completed_at' => $form->completed_at?->toISOString(), 'created_at' => $form->created_at?->toISOString(),
            'updated_at' => $form->updated_at?->toISOString(),
        ];
        if ($detail) {
            $data['payload'] = $form->payload;
            $data['events'] = $form->relationLoaded('events') ? $form->events->map(fn ($event) => [
                'id' => $event->id, 'action' => $event->action, 'from_status' => $event->from_status,
                'to_status' => $event->to_status, 'note' => $event->note, 'user' => $event->user,
                'created_at' => $event->created_at?->toISOString(),
            ])->values() : [];
        }

        return $data;
    }
}

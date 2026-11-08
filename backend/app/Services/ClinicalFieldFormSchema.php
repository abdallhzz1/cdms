<?php

namespace App\Services;

use Illuminate\Support\Arr;
use Illuminate\Validation\ValidationException;

class ClinicalFieldFormSchema
{
    public const ASSISTANT_FOLLOW_UP = 'assistant_follow_up';

    public const DEPARTMENT_PERIODIC_REPORT = 'department_periodic_report';

    public const DIRECTOR_SUPERVISORY_VISIT = 'director_supervisory_visit';

    public const TYPES = [
        self::ASSISTANT_FOLLOW_UP,
        self::DEPARTMENT_PERIODIC_REPORT,
        self::DIRECTOR_SUPERVISORY_VISIT,
    ];

    private const ASSISTANT_ITEMS = [
        'student_attendance', 'supervisor_attendance', 'active_participation',
        'case_availability', 'schedule_adherence', 'course_alignment',
        'guidance_feedback', 'professional_conduct', 'patient_safety',
        'training_environment',
    ];

    private const DEPARTMENT_ITEMS = [
        'supervisor_adequacy', 'attendance_coverage', 'plan_alignment',
        'case_adequacy', 'assessment_feedback', 'patient_safety',
        'respectful_environment', 'facilities_resources', 'hospital_coordination',
    ];

    private const OVERALL_ITEMS = [
        'clinical_supervision', 'learning_opportunities', 'hospital_cooperation',
        'training_environment_safety',
    ];

    public static function createPermission(string $type): string
    {
        return match ($type) {
            self::ASSISTANT_FOLLOW_UP => 'clinical_field_monitoring.create_assistant',
            self::DEPARTMENT_PERIODIC_REPORT => 'clinical_field_monitoring.create_department_report',
            self::DIRECTOR_SUPERVISORY_VISIT => 'clinical_field_monitoring.create_supervisory_visit',
            default => throw ValidationException::withMessages(['type' => ['Unsupported form type.']]),
        };
    }

    public static function recipientRole(string $type): string
    {
        return $type === self::DIRECTOR_SUPERVISORY_VISIT ? 'DEAN' : 'CLINICAL_DIRECTOR';
    }

    /** @param array<string, mixed> $payload */
    public static function validate(string $type, array $payload): array
    {
        return match ($type) {
            self::ASSISTANT_FOLLOW_UP => self::validateAssistant($payload),
            self::DEPARTMENT_PERIODIC_REPORT => self::validateDepartment($payload),
            self::DIRECTOR_SUPERVISORY_VISIT => self::validateDirector($payload),
            default => throw ValidationException::withMessages(['type' => ['Unsupported form type.']]),
        };
    }

    /** @param array<string, mixed> $payload */
    public static function isUrgent(string $type, array $payload): bool
    {
        if ((bool) Arr::get($payload, 'urgent.direct_risk', false)) {
            return true;
        }

        if ($type === self::ASSISTANT_FOLLOW_UP) {
            return in_array(Arr::get($payload, 'responses.patient_safety.rating'), ['partial', 'no'], true);
        }
        if ($type === self::DEPARTMENT_PERIODIC_REPORT) {
            return in_array(Arr::get($payload, 'responses.patient_safety.rating'), ['partial', 'no'], true);
        }

        foreach ((array) Arr::get($payload, 'specialties', []) as $specialty) {
            if (($specialty['rating'] ?? null) === 'unsatisfactory') {
                return true;
            }
        }

        return in_array(Arr::get($payload, 'overall.training_environment_safety.rating'), ['poor'], true);
    }

    private static function validateAssistant(array $payload): array
    {
        self::requireText($payload, ['context.clinical_specialty', 'context.rotation_name', 'context.clinical_supervisor', 'context.student_group']);
        self::requireNonNegativeIntegers($payload, ['context.students_present', 'context.students_absent']);
        self::validateResponses($payload, self::ASSISTANT_ITEMS, ['yes', 'partial', 'no']);
        self::validateFollowUp($payload);
        self::validateUrgent($payload, self::isUrgent(self::ASSISTANT_FOLLOW_UP, $payload));

        return $payload;
    }

    private static function validateDepartment(array $payload): array
    {
        self::requireText($payload, ['context.department_head']);
        self::requireNonNegativeIntegers($payload, ['context.student_count', 'context.supervisor_count']);
        self::validateResponses($payload, self::DEPARTMENT_ITEMS, ['yes', 'partial', 'no', 'not_verified', 'not_applicable']);
        $previous = Arr::get($payload, 'previous_period_status');
        if (! in_array($previous, ['none', 'completed', 'in_progress', 'not_implemented'], true)) {
            throw ValidationException::withMessages(['payload.previous_period_status' => ['Select the previous-period action status.']]);
        }
        self::validateActions((array) Arr::get($payload, 'improvements', []));
        self::validateUrgent($payload, self::isUrgent(self::DEPARTMENT_PERIODIC_REPORT, $payload));

        return $payload;
    }

    private static function validateDirector(array $payload): array
    {
        $visitType = Arr::get($payload, 'context.visit_type');
        if (! in_array($visitType, ['routine', 'follow_up', 'emergency'], true)) {
            throw ValidationException::withMessages(['payload.context.visit_type' => ['Select the visit type.']]);
        }
        $specialties = (array) Arr::get($payload, 'specialties', []);
        if ($specialties === []) {
            throw ValidationException::withMessages(['payload.specialties' => ['At least one clinical specialty is required.']]);
        }
        foreach ($specialties as $index => $specialty) {
            $name = $specialty['name'] ?? $specialty['name_ar'] ?? $specialty['name_en'] ?? '';
            if (trim((string) $name) === '') {
                throw ValidationException::withMessages(["payload.specialties.$index.name" => ['Specialty name is required.']]);
            }
            $specialties[$index]['name'] = $name;
            if (! in_array($specialty['rating'] ?? null, ['satisfactory', 'needs_improvement', 'unsatisfactory', 'not_assessed'], true)) {
                throw ValidationException::withMessages(["payload.specialties.$index.rating" => ['Select a valid specialty assessment.']]);
            }
            if (($specialty['rating'] ?? null) !== 'not_assessed' && ! in_array($specialty['basis'] ?? null, ['direct', 'reports'], true)) {
                throw ValidationException::withMessages(["payload.specialties.$index.basis" => ['Select the assessment basis.']]);
            }
            if (in_array($specialty['rating'] ?? null, ['needs_improvement', 'unsatisfactory'], true) && trim((string) ($specialty['notes'] ?? '')) === '') {
                throw ValidationException::withMessages(["payload.specialties.$index.notes" => ['Notes are required for this assessment.']]);
            }
        }
        self::validateResponsesAt($payload, 'overall', self::OVERALL_ITEMS, ['good', 'acceptable', 'poor']);
        self::validateActions((array) Arr::get($payload, 'actions', []));
        self::validateFollowUp($payload);
        self::validateUrgent($payload, self::isUrgent(self::DIRECTOR_SUPERVISORY_VISIT, $payload));
        $payload['specialties'] = $specialties;

        return $payload;
    }

    private static function validateResponses(array $payload, array $items, array $ratings): void
    {
        self::validateResponsesAt($payload, 'responses', $items, $ratings);
    }

    private static function validateResponsesAt(array $payload, string $root, array $items, array $ratings): void
    {
        foreach ($items as $item) {
            $rating = Arr::get($payload, "$root.$item.rating");
            if (! in_array($rating, $ratings, true)) {
                throw ValidationException::withMessages(["payload.$root.$item.rating" => ['Select a valid assessment.']]);
            }
            if (in_array($rating, ['partial', 'no', 'needs_improvement', 'unsatisfactory', 'acceptable', 'poor'], true)
                && trim((string) Arr::get($payload, "$root.$item.comment", '')) === '') {
                throw ValidationException::withMessages(["payload.$root.$item.comment" => ['A comment is required for this assessment.']]);
            }
        }
    }

    private static function validateActions(array $actions): void
    {
        foreach ($actions as $index => $action) {
            foreach (['area', 'improvement', 'action', 'responsible', 'deadline', 'priority'] as $field) {
                if (trim((string) ($action[$field] ?? '')) === '') {
                    throw ValidationException::withMessages(["payload.actions.$index.$field" => ['Complete all improvement action fields.']]);
                }
            }
            if (! in_array($action['priority'] ?? null, ['urgent', 'important', 'routine'], true)) {
                throw ValidationException::withMessages(["payload.actions.$index.priority" => ['Select a valid priority.']]);
            }
        }
    }

    private static function validateFollowUp(array $payload): void
    {
        if ((bool) Arr::get($payload, 'follow_up.required', false) && ! Arr::get($payload, 'follow_up.date')) {
            throw ValidationException::withMessages(['payload.follow_up.date' => ['A follow-up date is required.']]);
        }
    }

    private static function validateUrgent(array $payload, bool $urgent): void
    {
        if (! $urgent) {
            return;
        }
        foreach (['urgent.details', 'urgent.action_taken', 'urgent.notified_at'] as $path) {
            if (trim((string) Arr::get($payload, $path, '')) === '') {
                throw ValidationException::withMessages(["payload.$path" => ['Urgent-case documentation is required.']]);
            }
        }
    }

    private static function requireText(array $payload, array $paths): void
    {
        foreach ($paths as $path) {
            if (trim((string) Arr::get($payload, $path, '')) === '') {
                throw ValidationException::withMessages(["payload.$path" => ['This field is required.']]);
            }
        }
    }

    private static function requireNonNegativeIntegers(array $payload, array $paths): void
    {
        foreach ($paths as $path) {
            $value = Arr::get($payload, $path);
            if (filter_var($value, FILTER_VALIDATE_INT) === false || (int) $value < 0) {
                throw ValidationException::withMessages(["payload.$path" => ['Enter a non-negative whole number.']]);
            }
        }
    }
}

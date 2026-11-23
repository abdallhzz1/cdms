<?php

namespace App\Services\Reports;

use App\Models\{DistributionVersion, CourseScheduleCell, CourseScheduleBlockActivity};
use App\Services\DepartmentHeadCourseScope;
use App\Services\Distribution\ClinicalScheduleDateCalculator;
use App\Services\SupervisorWorkScheduleService;

class ClinicalDistributionMatrixReport
{
    public function build(array $filters): array
    {
        $ar = app()->getLocale() !== 'en';
        $name = fn ($item) => $item ? ($ar ? $item->name_ar : ($item->name_en ?: $item->name_ar)) : '';
        $query = DistributionVersion::query()->with(['rotation.course', 'rotation.academicYear', 'rotation.clinicalPeriod', 'rotation.blocks', 'breaks']);
        app(DepartmentHeadCourseScope::class)->throughRotation($query, 'rotation');
        $query->whereHas('rotation', function ($q) use ($filters) {
            foreach (['academic_year_id', 'clinical_period_id', 'academic_level', 'course_id'] as $key) {
                if (!empty($filters[$key])) $q->where($key, $filters[$key]);
            }
        });
        if (($filters['schedule_version'] ?? 'working') === 'published') $query->where('status', 'published')->where('is_current', true);
        else $query->whereIn('status', ['draft', 'suggested', 'manual', 'published']);
        $versions = $query->orderByRaw("CASE WHEN status IN ('draft','suggested','manual') THEN 0 WHEN status = 'published' AND is_current = 1 THEN 1 ELSE 2 END")->orderByDesc('id')->get()->unique('rotation_id');
        $versions->load(['courseScheduleRows.trainingSite', 'courseScheduleRows.person.availabilities', 'courseScheduleRows.supervisorLinks.person']);
        $cells = CourseScheduleCell::whereIn('distribution_version_id', $versions->pluck('id'))->with(['studentSubgroup.group', 'trainingSite'])->get()->groupBy('distribution_version_id');
        $activities = CourseScheduleBlockActivity::whereIn('distribution_version_id', $versions->pluck('id'))->get()->groupBy('distribution_version_id');
        $dates = app(ClinicalScheduleDateCalculator::class);
        $matrices = [];
        foreach ($versions as $version) {
            $rotation = $version->rotation;
            $versionCells = ($cells[$version->id] ?? collect())->groupBy(fn ($cell) => $cell->course_schedule_row_id.':'.$cell->rotation_block_id);
            $title = implode(' · ', array_filter([$rotation->course?->code, $name($rotation->course) ?: $rotation->name, $rotation->academicYear?->code, __('distribution_report.'.$rotation->academic_level), $name($rotation->clinicalPeriod) ?: __('distribution_report.annual')]));
            $blocks = $rotation->blocks->sortBy('from_week');
            $duration = max(1, (int) $rotation->duration_weeks, (int) $blocks->max('to_week'));
            foreach (range(0, (int) ceil($duration / 12) - 1) as $part) {
                $weeks = [];
                foreach (range($part * 12 + 1, $part * 12 + 12) as $week) {
                    $block = $blocks->first(fn ($b) => $b->from_week <= $week && $b->to_week >= $week);
                    $activity = ($activities[$version->id] ?? collect())->firstWhere('rotation_block_id', $block?->id);
                    $weeks[] = ['number' => $week, 'start' => $week <= $duration && $rotation->start_date ? $dates->calculateBlockStartDate($rotation->start_date, $week, $version->breaks) : null,
                        'end' => $week <= $duration && $rotation->start_date ? $dates->calculateBlockEndDate($rotation->start_date, $week, $version->breaks) : null,
                        'activity' => $activity && $activity->activity_type !== 'clinical' ? ($activity->activity_label ?: __('distribution_report.'.$activity->activity_type)).($activity->activity_scope === 'main_groups' ? ' ('.implode(', ', $activity->main_group_codes ?: []).')' : '') : '',
                        'block_id' => $block?->id, 'all_activity' => $activity && $activity->activity_type !== 'clinical' && $activity->activity_scope === 'all'];
                }
                $rows = [];
                foreach ($version->courseScheduleRows->sortBy([['sort_order', 'asc'], ['id', 'asc']]) as $row) {
                    $legacyDays = $row->person?->availabilities->isNotEmpty()
                        ? $row->person->availabilities->where('training_site_id', $row->training_site_id)
                            ->filter(fn ($day) => ($day->status ?: 'work') === 'work'
                                && (! $rotation->start_date || ! $day->available_until || $day->available_until->gte($rotation->start_date))
                                && (! $rotation->start_date || ! $day->available_from || $day->available_from->toDateString() <= $dates->calculateBlockEndDate($rotation->start_date, $duration, $version->breaks)))
                            ->pluck('day')->filter()->unique()->all()
                        : SupervisorWorkScheduleService::DAYS;
                    $supervisors = $row->supervisorLinks->isNotEmpty() ? $row->supervisorLinks : collect($row->person ? [(object) ['person' => $row->person, 'weekdays' => $legacyDays]] : []);
                    $doctors = $supervisors->map(fn ($link) => $ar ? $link->person?->full_name_ar : ($link->person?->full_name_en ?: $link->person?->full_name_ar))->filter()->join(' + ');
                    $days = $supervisors->flatMap(fn ($link) => $link->weekdays ?: [])->unique()->map(fn ($day) => __('distribution_report.'.$day))->join(', ');
                    $values = [$name($row->trainingSite), $row->row_type === 'vacancy' ? ($row->label ?: __('distribution_report.vacancy')) : $doctors, $days];
                    if ($row->workplace_schedule) {
                        $values[0] = collect($row->workplace_schedule['locations'])->map(fn ($location) => $name((object) $location['training_site']).' ('.collect($location['days'])->map(fn ($day) => __('distribution_report.'.$day))->join(', ').')')->join(' / ');
                    }
                    foreach ($weeks as $week) {
                        $groups = ($versionCells[$row->id.':'.$week['block_id']] ?? collect())
                            ->map(fn ($cell) => $cell->studentSubgroup?->name.($cell->training_site_id && (int) $cell->training_site_id !== (int) $row->training_site_id ? ' · '.$name($cell->trainingSite) : ''))->filter()->unique()->sort(SORT_NATURAL)->values()->join(' + ');
                        $values[] = $week['all_activity'] ? $week['activity'] : ($groups ?: '—');
                    }
                    $search = mb_strtolower(trim((string) ($filters['search'] ?? '')));
                    if ($search === '' || str_contains(mb_strtolower($title.' '.implode(' ', $values)), $search)) $rows[] = $values;
                }
                if (!empty($filters['search']) && !$rows) continue;
                $matrices[] = ['title' => $title, 'version_id' => $version->id, 'status' => $version->status, 'weeks' => $weeks, 'rows' => $rows,
                    'breaks' => $version->breaks->map(fn ($break) => $break->label.' · '.$break->start_date->format('Y-m-d').' / '.$break->end_date->format('Y-m-d'))->values()->all()];
            }
        }
        $columns = [__('distribution_report.schedule'), __('distribution_report.site'), __('distribution_report.supervisor'), __('distribution_report.days'), ...array_map(fn ($week) => __('distribution_report.week').' '.$week, range(1, 12))];
        return ['columns' => $columns, 'matrices' => $matrices, 'rows' => collect($matrices)->flatMap(fn ($matrix) => array_map(fn ($row) => [$matrix['title'], ...$row], $matrix['rows']))->all()];
    }
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AssessmentsMasterPage } from './AssessmentsMasterPage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, errors: {}, meta: {} }), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});
const reviewer = { id: 1, name: 'RTA', email: 'rta@hebron.edu', roles: ['RTA'], permissions: [{ code: 'assessment.review', scope: 'global' }] };
const groups = { groups: [
  { key: '1|1|2026', academic_year: { id: 1, code: '2026/2027' }, course: { id: 1, code: 'MED', name_ar: 'الباطني', name_en: 'Internal Medicine' }, group_name: 'Q', academic_level: 'fourth', batch_year: 2026, student_count: 3, subgroups: [
    { assignment_id: 11, name: 'Q1', student_count: 2, week_count: 2 },
    { assignment_id: 12, name: 'Q2', student_count: 1, week_count: 1 },
  ] },
  { key: '2|2|2026', academic_year: { id: 1, code: '2026/2027' }, course: { id: 2, code: 'SUR', name_ar: 'الجراحة', name_en: 'Surgery' }, group_name: 'L', academic_level: 'fourth', batch_year: 2026, student_count: 1, subgroups: [
    { assignment_id: 21, name: 'L1', student_count: 1, week_count: 1 },
  ] },
] };
const student = (id: number) => ({ id, university_number: `2201000${id}`, full_name_ar: `طالب ${id}`, full_name_en: `Student ${id}` });
const detail = (assignmentId: number) => ({
  assignment_id: assignmentId, academic_year: { id: 1, code: '2026/2027' }, course: groups.groups[0].course,
  group_name: 'Q', subgroup_name: assignmentId === 11 ? 'Q1' : 'Q2', batch_year: 2026, student_count: assignmentId === 11 ? 2 : 1,
  weeks: assignmentId === 11 ? [
    { number: 1, start_date: '2026-09-01', end_date: '2026-09-07', student_count: 2, ready_count: 1, students: [
      { student: student(1), supervisors: [], ready: true, assessments: [{ id: 1, status: 'submitted', score: '9.00', max_score: '10.00', notes: 'Good progress', evaluator: { id: 2, full_name_ar: 'طبيب 2', full_name_en: 'Doctor 2' }, submitted_at: '2026-09-07' }] },
      { student: student(2), supervisors: [{ id: 3, full_name_ar: 'طبيب 3', full_name_en: 'Doctor 3' }], ready: false, assessments: [] },
    ] },
    { number: 2, start_date: '2026-09-08', end_date: '2026-09-14', student_count: 2, ready_count: 0, students: [
      { student: student(1), supervisors: [], ready: false, assessments: [] },
      { student: student(2), supervisors: [], ready: false, assessments: [] },
    ] },
  ] : [{ number: 3, start_date: '2026-09-15', end_date: '2026-09-21', student_count: 1, ready_count: 0, students: [
    { student: student(3), supervisors: [], ready: false, assessments: [] },
  ] }],
});

afterEach(() => { vi.restoreAllMocks(); window.localStorage.removeItem('cdms.locale'); document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; });

describe('AssessmentsMasterPage review', () => {
  it('does not fetch review data without the separate assessment review permission', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ ...reviewer, permissions: [] });
      throw new Error(`Unexpected request: ${url}`);
    });

    renderWithProviders(<AssessmentsMasterPage />, { route: '/assessments' });
    expect(await screen.findByText('You do not have permission to review assessments')).toBeVisible();
    expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/clinical-assessments/'))).toBe(false);
  });

  it('shows every subgroup and assigned week, including students without a submitted assessment', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope(reviewer);
      if (url.includes('/clinical-assessments/review-groups')) return envelope(groups);
      if (url.includes('/clinical-assessments/review-subgroup')) return envelope(detail(Number(new URL(url, 'http://localhost').searchParams.get('assignment_id'))));
      throw new Error(`Unexpected request: ${url}`);
    });

    renderWithProviders(<AssessmentsMasterPage />, { route: '/assessments' });
    expect(await screen.findByRole('heading', { name: 'Clinical assessment review' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Group' }).querySelectorAll('option')).toHaveLength(2);
    expect(screen.getByRole('combobox', { name: 'Subgroup' }).querySelectorAll('option')).toHaveLength(2);
    expect(await screen.findByText('Week 1')).toBeVisible();
    expect(screen.getByText('Week 2')).toBeVisible();
    expect(screen.getAllByText('No assessment received yet').length).toBeGreaterThan(0);
    expect(screen.getByText('9.0 / 10')).toBeInTheDocument();
    expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/clinical-assessments?'))).toBe(false);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Subgroup' }), '12');
    await waitFor(() => expect(screen.getByText('Week 3')).toBeVisible());
    expect(screen.queryByText('Week 1')).not.toBeInTheDocument();
  });

  it('keeps the Arabic phone view focused on group, subgroup, and weekly results', async () => {
    window.localStorage.setItem('cdms.locale', 'ar');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope(reviewer);
      if (url.includes('/clinical-assessments/review-groups')) return envelope(groups);
      if (url.includes('/clinical-assessments/review-subgroup')) return envelope(detail(11));
      throw new Error(`Unexpected request: ${url}`);
    });

    renderWithProviders(<AssessmentsMasterPage />, { route: '/assessments' });
    expect(await screen.findByRole('heading', { name: 'مراجعة التقييمات السريرية' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'المجموعة' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'المجموعة الفرعية' })).toBeVisible();
    expect(await screen.findByText('الأسبوع 1')).toBeVisible();
    expect(screen.getByText('الأسبوع 2')).toBeVisible();
  });
});

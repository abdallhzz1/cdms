import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AssessmentsMasterPage } from './AssessmentsMasterPage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, errors: {}, meta: {} }), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});
const reviewer = { id: 1, name: 'RTA', email: 'rta@hebron.edu', roles: ['RTA'], permissions: [{ code: 'assessment.review', scope: 'global' }] };
const student = (id: number) => ({ id, university_number: `2201000${id}`, full_name_ar: `طالب ${id}`, full_name_en: `Student ${id}`, photo_url: `https://example.test/${id}.jpg` });
const groups = { groups: [
  { key: '1', academic_year: { id: 1, code: '2026/2027' }, group_name: 'Q', academic_level: 'fourth', student_count: 3, subgroups: [
    { id: 11, name: 'Q1', student_count: 2, week_count: 3, students: [student(1), student(2)] },
    { id: 12, name: 'Q2', student_count: 1, week_count: 0, students: [student(3)] },
  ] },
  { key: '2', academic_year: { id: 1, code: '2026/2027' }, group_name: 'L', academic_level: 'fourth', student_count: 1, subgroups: [
    { id: 21, name: 'L1', student_count: 1, week_count: 1, students: [student(4)] },
  ] },
] };
const detail = (id: number) => ({
  subgroup_id: id,
  rotations: id !== 11 ? [] : [
    { id: 1, course: { id: 1, code: 'MED', name_ar: 'الباطني', name_en: 'Internal Medicine' }, clinical_period: null, weeks: [
      { number: 1, start_date: '2026-09-01', end_date: '2026-09-07', student_count: 2, ready_count: 1, students: [
        { student: student(1), supervisors: [], ready: true, assessments: [{ id: 1, status: 'submitted', score: '9.00', max_score: '10.00', notes: null, evaluator: { id: 2, full_name_ar: 'طبيب 2', full_name_en: 'Doctor 2' } }] },
        { student: student(2), supervisors: [], ready: false, assessments: [] },
      ] },
      { number: 2, start_date: '2026-09-08', end_date: '2026-09-14', student_count: 2, ready_count: 0, students: [] },
    ] },
    { id: 2, course: { id: 2, code: 'SUR', name_ar: 'الجراحة', name_en: 'Surgery' }, clinical_period: null, weeks: [
      { number: 1, start_date: '2026-10-01', end_date: '2026-10-07', student_count: 2, ready_count: 0, students: [] },
    ] },
  ],
});

afterEach(() => { vi.restoreAllMocks(); window.localStorage.removeItem('cdms.locale'); document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; });

describe('AssessmentsMasterPage review', () => {
  it('does not fetch review data without permission', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async input => {
      if (String(input).includes('/auth/me')) return envelope({ ...reviewer, permissions: [] });
      throw new Error(`Unexpected request: ${input}`);
    });
    renderWithProviders(<AssessmentsMasterPage />, { route: '/assessments' });
    expect(await screen.findByText('You do not have permission to review assessments')).toBeVisible();
    expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/clinical-assessments/'))).toBe(false);
  });

  it('uses actual group letters, shows every subgroup roster and photo, and keeps courses inside its weeks', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope(reviewer);
      if (url.includes('/clinical-assessments/review-groups')) return envelope(groups);
      if (url.includes('/clinical-assessments/review-subgroup')) return envelope(detail(Number(new URL(url, 'http://localhost').searchParams.get('subgroup_id'))));
      throw new Error(`Unexpected request: ${url}`);
    });

    renderWithProviders(<AssessmentsMasterPage />, { route: '/assessments' });
    const groupSelect = await screen.findByRole('combobox', { name: 'Main group' });
    expect([...groupSelect.querySelectorAll('option')].map(option => option.textContent)).toEqual(['Group Q · Fourth year · 2026/2027', 'Group L · Fourth year · 2026/2027']);
    expect(await screen.findByRole('heading', { name: 'Subgroup Q1' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Subgroup Q2' })).toBeVisible();
    expect(await screen.findByText('Student 3')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Enlarge student photo' })).toHaveLength(3);
    expect(await screen.findByRole('columnheader', { name: 'Course: Internal Medicine' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Course: Surgery' })).toBeVisible();
    expect(screen.getAllByText('Week 1')).toHaveLength(2);
    expect(screen.getByText('Week 2')).toBeVisible();

    const matrix = screen.getByRole('table', { name: 'Q1' });
    expect(within(matrix).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Student', 'Course: Internal Medicine', 'Course: Surgery', '01/09Week 1', '08/09Week 2', '01/10Week 1']);
    const firstRow = within(matrix).getAllByRole('row')[2];
    expect(within(firstRow).getByRole('img', { name: 'Student 1' })).toHaveAttribute('src', 'https://example.test/1.jpg');
    expect(within(firstRow).getByRole('button', { name: 'Enlarge student photo' })).toHaveClass('rounded-full');
    expect(within(firstRow).getAllByRole('cell')[0]).toHaveTextContent('9');
    await userEvent.click(within(matrix).getByRole('button', { name: 'Student 1 · Week 1 · Q1 · Internal Medicine' }));
    expect(screen.getByText('9.0 / 10')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(matrix).getByRole('button', { name: 'Student 2 · Week 1 · Q1 · Internal Medicine' }));
    expect(screen.getByText('No assessment received yet')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('No published assignment weeks for this subgroup yet.')).toBeVisible();
    expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('subgroup_id=12'))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Weeks' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hide' })).not.toBeInTheDocument();
  });

  it('keeps Arabic mobile labels focused on real groups and subgroups', async () => {
    window.localStorage.setItem('cdms.locale', 'ar');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope(reviewer);
      if (url.includes('/clinical-assessments/review-groups')) return envelope(groups);
      if (url.includes('/clinical-assessments/review-subgroup')) return envelope(detail(Number(new URL(url, 'http://localhost').searchParams.get('subgroup_id'))));
      throw new Error(`Unexpected request: ${url}`);
    });
    renderWithProviders(<AssessmentsMasterPage />, { route: '/assessments' });
    const groupSelect = await screen.findByRole('combobox', { name: 'المجموعة الرئيسية' });
    expect(groupSelect.querySelector('option')?.textContent).toBe('المجموعة Q · السنة الرابعة · 2026/2027');
    expect(screen.getByRole('heading', { name: 'المجموعة الفرعية Q1' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'المجموعة الفرعية Q2' })).toBeVisible();
    expect(await screen.findByRole('columnheader', { name: 'المساق: الباطني' })).toBeVisible();
    expect(screen.getAllByText('الأسبوع 1')).toHaveLength(2);
    expect(screen.getByRole('table', { name: 'Q1' })).toHaveAttribute('dir', 'rtl');
    const matrix = screen.getByRole('table', { name: 'Q1' });
    expect(within(matrix).getByText('22010001')).toHaveClass('text-right');
    const subgroupTitle = screen.getByRole('heading', { name: 'المجموعة الفرعية Q1' });
    expect(within(subgroupTitle).getByText('Q1')).toHaveClass('text-2xl');
    expect(screen.getByRole('columnheader', { name: 'المساق: الباطني' })).toHaveClass('text-[11px]', 'font-medium');
    expect(screen.queryByRole('button', { name: 'إخفاء' })).not.toBeInTheDocument();
  });

  it('orders weeks and preserves separate official scores without averaging or treating draft scores as submitted', async () => {
    const response = detail(11);
    const firstWeek = response.rotations[0].weeks[0];
    firstWeek.students[0].assessments.push(
      { ...firstWeek.students[0].assessments[0], id: 2, score: '7.00', status: 'approved' },
      { ...firstWeek.students[0].assessments[0], id: 3, score: '10.00', status: 'draft' },
    );
    firstWeek.students[1].assessments.push({ ...firstWeek.students[0].assessments[0], id: 4, score: '0.00' });
    response.rotations[0].weeks.reverse();
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope(reviewer);
      if (url.includes('/review-groups')) return envelope(groups);
      if (url.includes('/review-subgroup')) return envelope(url.includes('subgroup_id=11') ? response : detail(12));
      throw new Error(`Unexpected request: ${url}`);
    });
    renderWithProviders(<AssessmentsMasterPage />, { route: '/assessments' });
    const matrix = await screen.findByRole('table', { name: 'Q1' });
    const rows = within(matrix).getAllByRole('row');
    expect(within(rows[1]).getAllByRole('columnheader')[0]).toHaveTextContent('Week 1');
    expect(within(rows[2]).getAllByRole('cell')[0]).toHaveTextContent('9 · 7');
    expect(within(rows[2]).getAllByRole('cell')[0]).not.toHaveTextContent('10');
    expect(within(rows[3]).getAllByRole('cell')[0]).toHaveTextContent('0');
    expect(within(rows[2]).getByRole('rowheader')).toHaveClass('sticky', 'start-0');
  });

  it('loads every subgroup matrix immediately with a single screen-wide hint', async () => {
    const response = detail(11);
    const secondResponse = { subgroup_id: 12, rotations: [{
      ...response.rotations[0], weeks: [{ ...response.rotations[0].weeks[0], students: [
        { student: student(3), supervisors: [], ready: true, assessments: [{ ...response.rotations[0].weeks[0].students[0].assessments[0], id: 5, score: '8.00' }] },
      ] }],
    }] };
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope(reviewer);
      if (url.includes('/review-groups')) return envelope(groups);
      if (url.includes('subgroup_id=11')) return envelope(response);
      if (url.includes('subgroup_id=12')) return envelope(secondResponse);
      throw new Error(`Unexpected request: ${url}`);
    });
    renderWithProviders(<AssessmentsMasterPage />, { route: '/assessments' });
    expect(await screen.findByRole('table', { name: 'Q1' })).toBeVisible();
    const secondMatrix = await screen.findByRole('table', { name: 'Q2' });
    expect(within(secondMatrix).getByText('8')).toBeVisible();
    expect(screen.getAllByText('Scroll horizontally for all weeks. Select a mark to view its details.')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Hide' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Weeks' })).not.toBeInTheDocument();
  });
});

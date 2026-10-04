import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
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

const mockMatrixWidth = (initialWidth: number) => {
  const listeners = new Set<(width: number) => void>();
  vi.stubGlobal('ResizeObserver', class {
    private notify?: (width: number) => void;
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.notify = width => this.callback([{ target, contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      listeners.add(this.notify);
      this.notify(initialWidth);
    }
    disconnect() { if (this.notify) listeners.delete(this.notify); }
  });
  return (width: number) => act(() => listeners.forEach(notify => notify(width)));
};

const mockReview = (response: ReturnType<typeof detail>) => vi.spyOn(window, 'fetch').mockImplementation(async input => {
  const url = String(input);
  if (url.includes('/auth/me')) return envelope(reviewer);
  if (url.includes('/review-groups')) return envelope(groups);
  if (url.includes('/review-subgroup')) return envelope(url.includes('subgroup_id=11') ? response : detail(12));
  throw new Error(`Unexpected request: ${url}`);
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); window.localStorage.removeItem('cdms.locale'); document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; });

describe('AssessmentsMasterPage review', () => {
  it('shows each training period separately and includes its mini OSCE in the detail', async () => {
    const first = detail(11).rotations[0];
    const periodDetail = { subgroup_id: 11, rotations: [{ ...first, weeks: [{
      number: -4, block_code: 'P1', start_date: '2026-09-01', end_date: '2026-09-28',
      student_count: 2, ready_count: 1, students: [{
        student: student(1), supervisors: [], ready: true,
        assessments: [{ id: 1, status: 'submitted', score: '8.00', max_score: '10.00', notes: null, evaluator: { id: 2, full_name_ar: 'طبيب', full_name_en: 'Doctor' } }],
        mini_osce: { score: 4, max_score: 5 },
      }],
    }, {
      number: -5, block_code: 'P2', start_date: '2026-09-29', end_date: '2026-10-26',
      student_count: 2, ready_count: 0, students: [],
    }] }] };
    mockReview(periodDetail);
    renderWithProviders(<AssessmentsMasterPage />, { route: '/assessments' });
    const matrix = await screen.findByRole('table', { name: 'Q1' });
    expect(within(matrix).getByText('Period P1')).toBeVisible();
    expect(within(matrix).getByText('Period P2')).toBeVisible();
    await userEvent.click(within(matrix).getByRole('button', { name: 'Student 1 · Period P1 · Q1 · Internal Medicine' }));
    expect(screen.getByText('Mini OSCE for this period: 4 / 5')).toBeVisible();
  });

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
    expect(screen.getAllByText('Select a mark for details. A dash means no submitted mark.')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Hide' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Weeks' })).not.toBeInTheDocument();
  });

  it('fits twelve compact weeks at desktop width without week navigation', async () => {
    mockMatrixWidth(1000);
    const response = detail(11);
    response.rotations = [response.rotations[0]];
    response.rotations[0].weeks = Array.from({ length: 12 }, (_, index) => ({ ...response.rotations[0].weeks[0], number: index + 1 }));
    mockReview(response);
    renderWithProviders(<AssessmentsMasterPage />, { route: '/assessments' });
    const matrix = await screen.findByRole('table', { name: 'Q1' });
    expect(matrix).toHaveClass('table-fixed');
    expect(within(matrix).getAllByRole('columnheader')).toHaveLength(14);
    expect(within(matrix).getByText('Week 12')).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Assessment week navigation' })).not.toBeInTheDocument();
    expect(within(matrix).getAllByRole('columnheader')[0]).not.toHaveClass('min-w-[240px]');
    expect(within(matrix).getAllByText('Pending').every(element => element.classList.contains('sr-only'))).toBe(true);
  });

  it('pages phone weeks without hiding students, mixing courses or losing access to score details', async () => {
    window.localStorage.setItem('cdms.locale', 'ar');
    const resize = mockMatrixWidth(350);
    const response = detail(11);
    const first = response.rotations[0].weeks[0];
    const surgery = response.rotations[1];
    response.rotations[0].weeks = Array.from({ length: 3 }, (_, index) => ({ ...first, number: index + 1 }));
    surgery.weeks = Array.from({ length: 4 }, (_, index) => ({ ...first, number: index + 1, students: [
      { ...first.students[0], assessments: [{ ...first.students[0].assessments[0], id: 10 + index, score: '7.00' }] },
      // Roster membership must not disappear when the current page has no assessment for this student.
      { student: student(5), supervisors: [], ready: false, assessments: [] },
    ] }));
    mockReview(response);
    renderWithProviders(<AssessmentsMasterPage />, { route: '/assessments' });
    const matrix = await screen.findByRole('table', { name: 'Q1' });
    expect(within(matrix).getAllByRole('columnheader')).toHaveLength(4);
    expect(within(matrix).getByText('طالب 5')).toBeVisible();
    const navigation = screen.getByRole('group', { name: 'التنقل بين أسابيع التقييم' });
    const previous = within(navigation).getByRole('button', { name: 'الأسابيع السابقة' });
    const next = within(navigation).getByRole('button', { name: 'الأسابيع التالية' });
    expect(previous).toBeDisabled();
    expect(within(navigation).getByText('1–2 / 7')).toBeVisible();
    expect(within(matrix).getByText('22010001')).toHaveClass('text-right');

    await userEvent.click(next);
    expect(within(navigation).getByText('3–4 / 7')).toBeVisible();
    expect(within(matrix).getByRole('columnheader', { name: 'المساق: الباطني' })).toHaveAttribute('colspan', '1');
    expect(within(matrix).getByRole('columnheader', { name: 'المساق: الجراحة' })).toHaveAttribute('colspan', '1');
    const firstStudent = within(matrix).getAllByRole('row')[2];
    const cells = within(firstStudent).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('9');
    expect(cells[1]).toHaveTextContent('7');
    await userEvent.click(within(matrix).getByRole('button', { name: 'طالب 1 · الأسبوع 1 · Q1 · الجراحة' }));
    expect(screen.getByText('7.0 / 10')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(next);
    await userEvent.click(next);
    expect(within(navigation).getByText('7–7 / 7')).toBeVisible();
    expect(next).toBeDisabled();
    expect(within(matrix).getByText('طالب 2')).toBeVisible();
    await userEvent.click(previous);
    expect(within(navigation).getByText('5–6 / 7')).toBeVisible();

    resize(1000);
    expect(screen.queryByRole('group', { name: 'التنقل بين أسابيع التقييم' })).not.toBeInTheDocument();
    expect(within(matrix).getAllByRole('columnheader')).toHaveLength(10);
    resize(350);
    expect(within(matrix).getAllByRole('columnheader')).toHaveLength(4);
    expect(screen.getByRole('group', { name: 'التنقل بين أسابيع التقييم' })).toBeVisible();
  });
});

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { renderWithProviders } from '@/test/renderWithProviders';
import { StudentPolicyCampaignPage } from './StudentPolicyCampaignPage';

vi.mock('xlsx', () => ({
  utils: { book_new: vi.fn(() => ({})), book_append_sheet: vi.fn(), json_to_sheet: vi.fn(data => data) },
  writeFile: vi.fn(),
}));
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

it('shows real paper and acknowledgement milestones in one table', async () => {
  vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
    if (String(input).includes('/auth/me')) return ok({ id: 1, name: 'Manager', roles: [], department_ids: [], permissions: [{ code: 'student_policies.manage' }] });
    return ok({ campaign: { id: 7, public_id: 'public', status: 'published', deadline: '2026-10-01', target_levels: ['fourth'], document: { title_ar: 'مدونة سلوك طلبة الطب', title_en: 'Medical Students Code of Conduct', version_label: '2026.1' }, academic_year: { id: 1, code: '2026/2027' }, counts: { total: 1, not_opened: 1, acknowledged: 0, paper_received: 0, scan_attached: 0 } }, assignments: { data: [{ id: 2, student: { id: 3, university_number: '22310001', full_name_ar: 'طالب تجريبي', academic_level: 'fourth' }, opened_at: null, acknowledged_at: null, paper_received_at: null, scan_attached: false }], current_page: 1, last_page: 1, total: 1 } });
  });
  renderWithProviders(<Routes><Route path="/student-policies/:id" element={<StudentPolicyCampaignPage />} /></Routes>, { route: '/student-policies/7' });
  expect(await screen.findByText('طالب تجريبي')).toBeVisible();
  expect(screen.getAllByText(/لم يفتح/).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: /حذف الحملة نهائيًا/ })).toBeVisible();
});

it('keeps the search input focused while results are loading after each character', async () => {
  vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
    if (String(input).includes('/auth/me')) return ok({ id: 1, name: 'Manager', roles: [], department_ids: [], permissions: [{ code: 'student_policies.view' }] });
    if (String(input).includes('search=')) return new Promise<Response>(() => {});
    return ok({ campaign: { id: 7, public_id: 'public', status: 'published', deadline: '2026-10-01', target_levels: ['fourth'], document: { title_ar: 'تعهد الطلبة', title_en: 'Policy', version_label: '2026.1' }, academic_year: { id: 1, code: '2026/2027' }, counts: { total: 1 } }, assignments: { data: [{ id: 2, student: { id: 3, university_number: '22310001', full_name_ar: 'طالب تجريبي', academic_level: 'fourth' }, scan_attached: false }], current_page: 1, last_page: 1, total: 1 } });
  });
  renderWithProviders(<Routes><Route path="/student-policies/:id" element={<StudentPolicyCampaignPage />} /></Routes>, { route: '/student-policies/7' });
  const input = await screen.findByRole('textbox', { name: 'بحث باسم الطالب أو رقمه' });
  input.focus();
  fireEvent.change(input, { target: { value: 'ط' } });
  await screen.findByText('جارٍ تحديث النتائج…');
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: 'طا' } });
  expect(input).toHaveFocus();
  expect(input).toHaveValue('طا');
});

it('keeps search available if the result request fails', async () => {
  vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
    if (String(input).includes('/auth/me')) return ok({ id: 1, name: 'Manager', roles: [], department_ids: [], permissions: [{ code: 'student_policies.view' }] });
    if (String(input).includes('search=')) return new Response(JSON.stringify({ success: false, message: 'تعذر البحث' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    return ok({ campaign: { id: 7, public_id: 'public', status: 'published', deadline: '2026-10-01', target_levels: ['fourth'], document: { title_ar: 'تعهد الطلبة', title_en: 'Policy', version_label: '2026.1' }, academic_year: { id: 1, code: '2026/2027' }, counts: { total: 1 } }, assignments: { data: [], current_page: 1, last_page: 1, total: 0 } });
  });
  renderWithProviders(<Routes><Route path="/student-policies/:id" element={<StudentPolicyCampaignPage />} /></Routes>, { route: '/student-policies/7' });
  const input = await screen.findByRole('textbox', { name: 'بحث باسم الطالب أو رقمه' });
  fireEvent.change(input, { target: { value: 'ط' } });
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('تعذر البحث'));
  expect(input).toBeInTheDocument();
  expect(input).toHaveValue('ط');
});

it('paginates the roster and clears selection when the page changes', async () => {
  vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
    if (String(input).includes('/auth/me')) return ok({ id: 1, name: 'Manager', roles: [], department_ids: [], permissions: [{ code: 'student_policies.manage' }] });
    const secondPage = String(input).includes('page=2');
    return ok({ campaign: { id: 7, public_id: 'public', status: 'published', deadline: '2026-10-01', target_levels: ['fourth'], document: { title_ar: 'تعهد الطلبة', title_en: 'Policy', version_label: '2026.1' }, academic_year: { id: 1, code: '2026/2027' }, counts: { total: 101 } }, assignments: { data: [{ id: secondPage ? 3 : 2, student: { id: secondPage ? 4 : 3, university_number: secondPage ? '22310002' : '22310001', full_name_ar: secondPage ? 'طالب ثان' : 'طالب أول', academic_level: 'fourth' }, scan_attached: false }], current_page: secondPage ? 2 : 1, last_page: 2, total: 101 } });
  });
  renderWithProviders(<Routes><Route path="/student-policies/:id" element={<StudentPolicyCampaignPage />} /></Routes>, { route: '/student-policies/7' });
  expect(await screen.findByText('طالب أول')).toBeVisible();
  fireEvent.click(screen.getByRole('checkbox', { name: 'تحديد طالب أول' }));
  expect(screen.getByRole('button', { name: /تسجيل استلام \(1\)/ })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
  expect(screen.queryByRole('button', { name: /تسجيل استلام \(1\)/ })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('طالب ثان')).toBeVisible());
  expect(screen.getByText(/صفحة 2 من 2/)).toBeVisible();
});

it('exports every filtered result page rather than only the visible table page', async () => {
  const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/auth/me')) return ok({ id: 1, name: 'Manager', roles: [], department_ids: [], permissions: [{ code: 'student_policies.view' }] });
    if (url.includes('/record-export')) return ok(null);
    const params = new URL(url, 'http://localhost').searchParams;
    const exportPage = params.get('per_page') === '2000';
    const secondPage = params.get('page') === '2';
    const assignment = (name: string, number: string) => ({ id: secondPage ? 3 : 2, student: { id: secondPage ? 4 : 3, university_number: number, full_name_ar: name, academic_level: 'fourth' }, scan_attached: false });
    return ok({ campaign: { id: 7, public_id: 'public', status: 'published', deadline: '2026-10-01', target_levels: ['fourth'], document: { title_ar: 'تعهد الطلبة', title_en: 'Policy', version_label: '2026.1' }, academic_year: { id: 1, code: '2026/2027' }, counts: { total: 2 } }, assignments: { data: [secondPage ? assignment('طالب ثان', '22310002') : assignment('طالب أول', '22310001')], current_page: secondPage ? 2 : 1, last_page: exportPage ? 2 : 1, total: 2 } });
  });
  renderWithProviders(<Routes><Route path="/student-policies/:id" element={<StudentPolicyCampaignPage />} /></Routes>, { route: '/student-policies/7' });
  expect(await screen.findByText('طالب أول')).toBeVisible();
  fireEvent.change(screen.getByRole('textbox', { name: 'بحث باسم الطالب أو رقمه' }), { target: { value: 'طالب' } });
  fireEvent.click(screen.getByRole('button', { name: 'تصدير Excel' }));
  await waitFor(() => expect(XLSX.writeFile).toHaveBeenCalledOnce());
  expect(fetchSpy.mock.calls.some(([input]) => {
    const params = new URL(String(input), 'http://localhost').searchParams;
    return params.get('per_page') === '2000' && params.get('page') === '2' && params.get('search') === 'طالب';
  })).toBe(true);
  expect(XLSX.utils.json_to_sheet).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ 'الرقم الجامعي': '22310001' }),
    expect.objectContaining({ 'الرقم الجامعي': '22310002' }),
  ]));
});

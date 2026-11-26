import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ClinicalStudentFeedbackPage } from './ClinicalStudentFeedbackPage';

const response = (data: unknown) => new Response(JSON.stringify({ success: true, data, meta: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const student = { id: 7, university_number: '22000007', full_name_ar: 'طالب تجربة', full_name_en: 'Test Student' };
const runId = '2d45f1dc-3450-42dc-9009-880bf9267580';
const slot = { key: 'a'.repeat(64), rotation_id: 1, academic_year: '2026/2027', period_key: '1|1', course_id: 1, course_ar: 'الجراحة', course_en: 'Surgery', period_ar: 'الأولى', period_en: 'Period one', kind: 'weekly', from_week: 1, to_week: 1, starts_on: '2026-08-02', ends_on: '2026-08-08', supervisor_ar: 'مشرف', supervisor_en: 'Supervisor', feedback_done: false, can_participate: true, mark_ready: true };
const show = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeEach(() => {
  localStorage.setItem('cdms.locale', 'en'); document.cookie = 'XSRF-TOKEN=test';
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
});
afterEach(() => {
  vi.restoreAllMocks();
  if (show) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', show); else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (close) Object.defineProperty(HTMLDialogElement.prototype, 'close', close); else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

describe('staff student portal testing', () => {
  it('lets a test-only assistant find a real student, test the mark gate and delete a reply or the full test through staff endpoints', async () => {
    let exists = false; let answered = false; const writes: { url: string; method: string; body: unknown }[] = [];
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input); const method = init?.method ?? 'GET';
      if (url.includes('/auth/me')) return response({ id: 3, name: 'Assistant', roles: ['ADMIN_ASSISTANT'], permissions: ['test', 'delete_test'].map(p => ({ code: `clinical_feedback.${p}`, scope: 'global' })) });
      if (url.endsWith('/options')) return response({ rotations: [], minimum_responses: 1 });
      if (url.includes('/test-students?')) return response([student]);
      if (url.includes('/test-runs?page=')) return response({ runs: exists ? [{ ...student, id: runId, answers_count: answered ? 1 : 0, is_active: true }] : [], current_page: 1, last_page: 1 });
      if (url.endsWith('/test-runs') && method === 'POST') { writes.push({ url, method, body: JSON.parse(String(init?.body)) }); exists = true; return response({ id: runId }); }
      if (url.endsWith(`/${runId}/identity`)) return response({ student });
      if (url.endsWith(`/${runId}/marks`)) return response({ slots: [{ ...slot, can_participate: !answered, feedback_done: answered, ...(answered ? { mark: { score: 8, max_score: 10, revision: 1 }, test_response: { id: 'test-answer', experience: 4, supervision: 5, comment: 'A test reply' } } : {}) }], is_test: true });
      if (url.endsWith(`/${runId}/participate`)) { writes.push({ url, method, body: JSON.parse(String(init?.body)) }); answered = true; return response(null); }
      if (url.endsWith(`/${runId}/answers/test-answer`) && method === 'DELETE') { answered = false; return response(null); }
      if (url.endsWith(`/${runId}`) && method === 'DELETE') { exists = false; return response(null); }
      throw new Error(url);
    });
    renderWithProviders(<ClinicalStudentFeedbackPage />);
    await userEvent.type(await screen.findByRole('textbox', { name: 'Find a student by name or university number' }), student.university_number);
    await userEvent.click(await screen.findByRole('button', { name: 'Start test' }));
    const dialog = await screen.findByRole('dialog', { name: 'Test student portal' });
    const submit = await within(dialog).findByRole('button', { name: 'Send test response and view mark' });
    expect(submit).toBeDisabled();
    expect(within(dialog).queryByText('Your clinical assessment mark')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'How useful was your training?: 4' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'How was the supervision and guidance?: 5' }));
    await userEvent.click(submit);
    expect(await within(dialog).findByText('Your clinical assessment mark')).toBeVisible();
    expect(within(dialog).getByText('A test reply')).toBeVisible();
    expect(within(dialog).getByText('4 / 5')).toHaveAttribute('dir', 'ltr');
    expect(writes[0].body).toEqual({ student_id: student.id });
    expect(writes[1]).toMatchObject({ method: 'POST', body: { key: slot.key, experience: 4, supervision: 5, comment: null } });
    expect(writes.every(w => w.url.includes('/clinical-student-feedback/test-runs'))).toBe(true);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete test response' }));
    expect(await within(dialog).findByRole('button', { name: 'Send test response and view mark' })).toBeDisabled();
    expect(within(dialog).queryByText('Your clinical assessment mark')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Close test' })[0]);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete test' }));
    expect(await screen.findByText('You have no saved tests.')).toBeVisible();
  });

  it('allows cleanup-only permission without offering student impersonation or a new test', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return response({ id: 3, name: 'Cleaner', roles: ['ADMIN_ASSISTANT'], permissions: [{ code: 'clinical_feedback.delete_test', scope: 'global' }] });
      if (url.endsWith('/options')) return response({ rotations: [] });
      if (url.includes('/test-runs?page=')) return response({ runs: [{ ...student, id: runId, answers_count: 1, is_active: false }], current_page: 1, last_page: 1 });
      throw new Error(url);
    });
    renderWithProviders(<ClinicalStudentFeedbackPage />);
    expect(await screen.findByRole('button', { name: 'Delete test' })).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open test' })).not.toBeInTheDocument();
  });
});

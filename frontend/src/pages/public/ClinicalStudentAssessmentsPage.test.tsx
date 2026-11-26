import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ClinicalStudentAssessmentsPage } from './ClinicalStudentAssessmentsPage';

const response = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, data: status < 400 ? data : null, message: status < 400 ? null : 'Please retry', errors: {}, meta: {} }), { status, headers: { 'Content-Type': 'application/json' } });
const student = { full_name_ar: 'طالب تجربة', full_name_en: 'Test Student', university_number: '22000001' };
const slot = { key: 'a'.repeat(64), rotation_id: 1, academic_year: '2026/2027', course_id: 1, course_ar: 'الجراحة', course_en: 'Surgery', period_ar: 'الفترة الأولى', period_en: 'Period one', kind: 'weekly', from_week: 2, to_week: 2, starts_on: '2026-09-01', ends_on: '2026-09-07', supervisor_ar: 'المشرف', supervisor_en: 'Clinical supervisor', feedback_done: false, can_participate: true, mark_ready: true };

afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; });

describe('student clinical assessments', () => {
  it('requires the two short answers, keeps the selected week after sending, and never sends student IDs or grades', async () => {
    localStorage.setItem('cdms.locale', 'en'); document.cookie = 'XSRF-TOKEN=test';
    let done = false; const bodies: Record<string, unknown>[] = [];
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(null, 401);
      if (url.endsWith('/identity')) return response({ student });
      if (url.endsWith('/marks')) return response({ slots: [{ ...slot, feedback_done: done, can_participate: !done, ...(done ? { mark: { score: 8, max_score: 10, revision: 1 } } : {}) }, { ...slot, key: 'b'.repeat(64), from_week: 1, to_week: 1, starts_on: '2026-08-01' }] });
      if (url.endsWith('/participate')) { expect(new Headers(init?.headers).get('X-Requested-With')).toBe('XMLHttpRequest'); bodies.push(JSON.parse(String(init?.body))); done = true; return response(null); }
      throw new Error(url);
    });
    renderWithProviders(<ClinicalStudentAssessmentsPage />);
    const submit = await screen.findByRole('button', { name: /Send and view my mark/ });
    const selectedWeek = (screen.getByRole('combobox', { name: 'Week / period' }) as HTMLSelectElement).value;
    expect(submit).toBeDisabled(); expect(screen.queryByText('8')).not.toBeInTheDocument();
    expect(screen.getByText(/Your name and number are not shown/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'How useful was your training?: 4' }));
    await userEvent.click(screen.getByRole('button', { name: 'How was the supervision and guidance?: 5' }));
    expect(submit).toBeEnabled(); await userEvent.click(submit);
    expect(await screen.findByText('Your clinical assessment mark')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Send and view my mark/ })).not.toBeInTheDocument();
    expect(bodies).toEqual([{ key: slot.key, experience: 4, supervision: 5, comment: null }]);
    expect(screen.getByRole('combobox', { name: 'Week / period' })).toHaveValue(selectedWeek);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Week / period' }), screen.getByRole('option', { name: 'Week 1' }));
    expect(screen.getByRole('button', { name: /Send and view my mark/ })).toBeDisabled();
    expect(screen.queryByText('Your clinical assessment mark')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Week / period' }), selectedWeek);
    expect(screen.getByText('Your clinical assessment mark')).toBeVisible();
  });

  it('preserves the answers after a failed request and permits unable-to-assess without forcing a comment', async () => {
    localStorage.setItem('cdms.locale', 'en'); document.cookie = 'XSRF-TOKEN=test';
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(null, 401);
      if (url.endsWith('/identity')) return response({ student });
      if (url.endsWith('/marks')) return response({ slots: [slot] });
      if (url.endsWith('/participate')) return response(null, 503);
      throw new Error(url);
    });
    renderWithProviders(<ClinicalStudentAssessmentsPage />);
    const choices = await screen.findAllByRole('button', { name: 'Unable to assess' });
    await userEvent.click(choices[0]); await userEvent.click(choices[1]);
    await userEvent.type(screen.getByRole('textbox', { name: 'Anything you would like to share? (optional)' }), 'A training concern');
    await userEvent.click(screen.getByRole('button', { name: /Send and view my mark/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please retry');
    expect(screen.getByRole('textbox', { name: 'Anything you would like to share? (optional)' })).toHaveValue('A training concern');
    expect(choices[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Your clinical assessment mark')).not.toBeInTheDocument();
  });

  it('verifies the email code before fetching marks and makes device remembering optional', async () => {
    localStorage.setItem('cdms.locale', 'en'); document.cookie = 'XSRF-TOKEN=test';
    let verified = false; let requestedMarks = 0; let verification: Record<string, unknown> | undefined;
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(null, 401);
      if (url.endsWith('/identity')) return response({ student: verified ? student : null });
      if (url.endsWith('/request-otp')) return response({ challenge: 'c'.repeat(64) });
      if (url.endsWith('/verify-otp')) { verification = JSON.parse(String(init?.body)); verified = true; return response(null); }
      if (url.endsWith('/marks')) { requestedMarks++; return response({ slots: [] }); }
      throw new Error(url);
    });
    renderWithProviders(<ClinicalStudentAssessmentsPage />);
    await userEvent.type(await screen.findByRole('textbox', { name: 'University number' }), student.university_number);
    await userEvent.click(screen.getByRole('button', { name: 'Send access code' }));
    expect(requestedMarks).toBe(0);
    await userEvent.type(await screen.findByRole('textbox', { name: 'Verification code' }), '١٢٣٤٥٦');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/No assessments are available yet/)).toBeVisible();
    expect(verification).toEqual({ challenge: 'c'.repeat(64), otp: '123456', remember: false });
    expect(requestedMarks).toBeGreaterThan(0);
  });

  it('offers only period and week selectors and shows all assessments for the selected week', async () => {
    localStorage.setItem('cdms.locale', 'en'); document.cookie = 'XSRF-TOKEN=test';
    const slots = [
      { ...slot, period_key: 'year1|p1' },
      { ...slot, key: 'b'.repeat(64), rotation_id: 2, course_id: 2, course_en: 'Medicine', period_key: 'year1|p1' },
      { ...slot, key: 'c'.repeat(64), rotation_id: 3, course_id: 3, course_en: 'Pediatrics', period_key: 'year1|p2', period_en: 'Period two', from_week: 1, to_week: 1 },
    ];
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(null, 401);
      if (url.endsWith('/identity')) return response({ student });
      if (url.endsWith('/marks')) return response({ slots });
      throw new Error(url);
    });
    renderWithProviders(<ClinicalStudentAssessmentsPage />);
    const period = await screen.findByRole('combobox', { name: 'Clinical period' });
    const week = screen.getByRole('combobox', { name: 'Week / period' });
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.queryByRole('combobox', { name: 'Course' })).not.toBeInTheDocument();
    expect(within(period).getAllByRole('option')).toHaveLength(2);
    expect(within(week).getAllByRole('option').map(o => o.textContent)).toEqual(['Week 2']);
    expect(screen.getByRole('region', { name: 'Week 2 · Surgery' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Week 2 · Medicine' })).toBeVisible();
    const comments = screen.getAllByRole('textbox');
    expect(new Set(comments.map(c => c.id)).size).toBe(2);
    await userEvent.selectOptions(period, 'year1|p2');
    expect(within(week).getAllByRole('option').map(o => o.textContent)).toEqual(['Week 1']);
    expect(screen.queryByRole('region', { name: 'Week 2 · Surgery' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Week 1' })).toBeVisible();
    await userEvent.selectOptions(period, 'year1|p1');
    expect(within(week).getAllByRole('option').map(o => o.textContent)).toEqual(['Week 2']);
    expect(screen.getAllByRole('button', { name: /Send and view my mark/ })).toHaveLength(2);
  });

  it('submits feedback for the right assessment when two courses share a week without revealing the other mark', async () => {
    localStorage.setItem('cdms.locale', 'en'); document.cookie = 'XSRF-TOKEN=test';
    let done = false; const bodies: Record<string, unknown>[] = [];
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(null, 401);
      if (url.endsWith('/identity')) return response({ student });
      if (url.endsWith('/marks')) return response({ slots: [slot, { ...slot, key: 'b'.repeat(64), rotation_id: 2, course_id: 2, course_en: 'Medicine', can_participate: !done, feedback_done: done, ...(done ? { mark: { score: 9, max_score: 10, revision: 1 } } : {}) }] });
      if (url.endsWith('/participate')) { bodies.push(JSON.parse(String(init?.body))); done = true; return response(null); }
      throw new Error(url);
    });
    renderWithProviders(<ClinicalStudentAssessmentsPage />);
    const medicine = await screen.findByRole('region', { name: 'Week 2 · Medicine' });
    await userEvent.click(within(medicine).getByRole('button', { name: 'How useful was your training?: 4' }));
    await userEvent.click(within(medicine).getByRole('button', { name: 'How was the supervision and guidance?: 5' }));
    await userEvent.click(within(medicine).getByRole('button', { name: /Send and view my mark/ }));
    expect(await within(medicine).findByText('Your clinical assessment mark')).toBeVisible();
    expect(bodies).toEqual([{ key: 'b'.repeat(64), experience: 4, supervision: 5, comment: null }]);
    const surgery = screen.getByRole('region', { name: 'Week 2 · Surgery' });
    expect(within(surgery).queryByText('Your clinical assessment mark')).not.toBeInTheDocument();
    expect(within(surgery).getByRole('button', { name: /Send and view my mark/ })).toBeDisabled();
    expect(within(screen.getByRole('combobox', { name: 'Week / period' })).getAllByRole('option')).toHaveLength(1);
  });

  it('keeps pending weeks free of a survey and reveals feedback before a later official mark', async () => {
    localStorage.setItem('cdms.locale', 'en'); document.cookie = 'XSRF-TOKEN=test';
    let assessed = false; let done = false;
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(null, 401);
      if (url.endsWith('/identity')) return response({ student });
      if (url.endsWith('/marks')) return response({ slots: [{ ...slot, can_participate: assessed && !done, mark_ready: assessed, assessment_available: assessed, status: assessed ? done ? 'visible' : 'feedback_required' : 'not_evaluated', feedback_done: done, ...(done ? { mark: { score: 9, max_score: 10, revision: 1 } } : {}) }] });
      if (url.endsWith('/participate')) { done = true; return response(null); }
      throw new Error(url);
    });
    renderWithProviders(<ClinicalStudentAssessmentsPage />);
    expect(await screen.findByText('Not yet assessed by the supervisor')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Send and view my mark/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    assessed = true;
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('button', { name: /Send and view my mark/ })).toBeDisabled();
    expect(screen.queryByText('Your clinical assessment mark')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'How useful was your training?: 4' }));
    await userEvent.click(screen.getByRole('button', { name: 'How was the supervision and guidance?: 5' }));
    await userEvent.click(screen.getByRole('button', { name: /Send and view my mark/ }));
    expect(await screen.findByText('Your clinical assessment mark')).toBeVisible();
  });
});

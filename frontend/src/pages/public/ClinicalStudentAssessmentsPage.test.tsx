import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
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
    expect(submit).toBeDisabled(); expect(screen.queryByText('8')).not.toBeInTheDocument();
    expect(screen.getByText(/Your name and number are not shown/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'How useful was your training?: 4' }));
    await userEvent.click(screen.getByRole('button', { name: 'How was the supervision and guidance?: 5' }));
    expect(submit).toBeEnabled(); await userEvent.click(submit);
    expect(await screen.findByText('Your clinical assessment mark')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Send and view my mark/ })).not.toBeInTheDocument();
    expect(bodies).toEqual([{ key: slot.key, experience: 4, supervision: 5, comment: null }]);
    expect(screen.getByRole('combobox', { name: 'Week / period' })).toHaveValue(slot.key);
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
});

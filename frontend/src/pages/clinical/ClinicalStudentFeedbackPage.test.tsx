import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ClinicalStudentFeedbackPage } from './ClinicalStudentFeedbackPage';

const response = (data: unknown, meta = {}) => new Response(JSON.stringify({ success: true, data, message: null, meta }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const rotation = { id: 1, course_ar: 'الجراحة', course_en: 'Surgery', year: '2026/2027', period_ar: 'الأولى', period_en: 'Period one', academic_level: 'fourth', window_id: 9, is_enabled: true, from_week: 1, ends_on: '2026-10-24', weeks: 12 };
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; });

describe('clinical feedback review permissions', () => {
  it('keeps Arabic rating averages ordered as value / maximum', async () => {
    localStorage.setItem('cdms.locale', 'ar');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return response({ id: 3, name: 'Reader', roles: ['QUALITY'], permissions: [{ code: 'clinical_feedback.view', scope: 'global' }] });
      if (url.includes('/options')) return response({ rotations: [rotation], student_url: '/portal/clinical-assessments', minimum_responses: 5 });
      if (url.includes('/reports?')) return response([{ id: 'batch-1', from_week: 1, to_week: 1, responses: 5, supervisor_ar: 'مشرف', experience: 4.2, supervision: 4.5 }]);
      throw new Error(url);
    });
    renderWithProviders(<ClinicalStudentFeedbackPage />);
    expect(await screen.findByText('4.2 / 5')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByText('4.5 / 5')).toHaveAttribute('dir', 'ltr');
  });

  it('shows a comment reader only redacted comments, without moderation or publication controls', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return response({ id: 1, name: 'Reader', roles: ['ADMIN_ASSISTANT'], permissions: [{ code: 'clinical_feedback.comments', scope: 'global' }] });
      if (url.includes('/options')) return response({ rotations: [rotation], student_url: '/portal/clinical-assessments', minimum_responses: 5 });
      if (url.includes('/comments?')) return response([{ id: 'comment-1', version: 'v'.repeat(64), window_id: 9, from_week: 1, to_week: 1, text: 'Safe redacted text', private_comment: 'MUST NEVER RENDER', reviewed_text: 'Safe redacted text', follow_up: 'reviewed', supervisor_en: 'Dr Clinical' }], { current_page: 1, last_page: 1 });
      throw new Error(url);
    });
    renderWithProviders(<ClinicalStudentFeedbackPage />);
    expect(await screen.findByText('Safe redacted text')).toBeVisible();
    expect(screen.queryByText('MUST NEVER RENDER')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Access and publication' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish selected marks' })).not.toBeInTheDocument();
  });

  it('provides an explicit redaction step to authorized moderators without adding identity or grade fields', async () => {
    localStorage.setItem('cdms.locale', 'en'); document.cookie = 'XSRF-TOKEN=test';
    const bodies: unknown[] = [];
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/me')) return response({ id: 2, name: 'Moderator', roles: ['QUALITY'], permissions: [{ code: 'clinical_feedback.moderate', scope: 'global' }] });
      if (url.includes('/options')) return response({ rotations: [rotation], student_url: '/portal/clinical-assessments', minimum_responses: 5 });
      if (url.includes('/comments?')) return response([{ id: 'comment-1', version: 'v'.repeat(64), window_id: 9, from_week: 1, to_week: 1, text: 'Original text', reviewed_text: null, follow_up: 'new' }], { current_page: 1, last_page: 1 });
      if (url.endsWith('/comments/comment-1')) { bodies.push(JSON.parse(String(init?.body))); return response({ version: 'n'.repeat(64) }); }
      throw new Error(url);
    });
    renderWithProviders(<ClinicalStudentFeedbackPage />);
    const field = await screen.findByRole('textbox', { name: /Redacted reviewer copy/ });
    await userEvent.clear(field); await userEvent.type(field, 'Safe copy');
    await userEvent.click(screen.getByRole('button', { name: 'Save redacted copy' }));
    expect(await screen.findByText('Saved.')).toBeVisible();
    expect(bodies).toEqual([{ version: 'v'.repeat(64), text: 'Safe copy', follow_up: 'new' }]);
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { QualityDashboardPage } from './QualityDashboardPage';
import { SurveysPage } from './SurveysPage';
import { SurveyDetailsPage } from './SurveyDetailsPage';
import { QualityOperationsPage } from './QualityOperationsPage';
import { ImprovementPlansPage } from './ImprovementPlansPage';
import { KpiPage } from './KpiPage';
import { PublicQualitySurveyPage } from '@/pages/public/PublicQualitySurveyPage';
import { SurveyParticipationPage } from './SurveyParticipationPage';

function response(data: unknown, meta: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ success: true, data, message: null, meta }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
function user(manage = false) {
  return { id: 3, name: 'Quality User', email: 'quality@hebron.edu', roles: ['QUALITY'], assigned_levels: [], permissions: [
    { code: 'quality.view', scope: 'global' }, ...(manage ? [{ code: 'quality.manage', scope: 'global' }, { code: 'kpi.manage', scope: 'global' }] : []),
  ] };
}

afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); });

describe('quality workspace', () => {
  it('keeps the dashboard focused on work and compact sections', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(user());
      if (url.includes('/quality-options')) return response({ academic_years: [] });
      if (url.includes('/quality-overview')) return response({
        counts: { surveys: 1, kpis: 2, plans_open: 1, findings_open: 1, evidence_expiring: 0 },
        recent_surveys: [], recent_plans: [], recent_kpis: [],
        attention: { overdue_plans: [{ id: 9, observation: 'Review placements', due_date: '2026-10-01T00:00:00.000000Z' }], pending_measurements: [] },
      });
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<QualityDashboardPage />);
    expect(await screen.findByRole('region', { name: 'Needs follow-up' })).toHaveTextContent('Review placements');
    expect(screen.getByRole('region', { name: 'Quality areas' })).toHaveTextContent('Findings & evidence');
    expect(screen.queryByText('Continuous improvement cycle')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Needs follow-up' })).toHaveTextContent('2026-10-01');
  });

  it('counts completed survey submissions and keeps mutation controls away from read-only users', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(user());
      if (url.includes('/quality-options')) return response({ academic_years: [] });
      if (url.includes('/quality-surveys?')) return response([{ id: 7, public_id: 'survey-id', code: 'SUR-0007', title: 'Clinical training', target_group: 'الطلبة', status: 'draft', academic_year: '2026/2027', questions_count: 4, responses_count: 40, submissions_count: 10 }], { total: 1, last_page: 1 });
      if (url.includes('/quality-surveys/7')) return response({ id: 7, public_id: 'survey-id', title: 'Clinical training', target_group: 'الطلبة', status: 'draft', is_anonymous: true, response_policy: 'multiple', questions: [] });
      throw new Error(`Unmocked request: ${url}`);
    });
    const { unmount } = renderWithProviders(<SurveysPage />);
    const list = await screen.findByRole('region', { name: 'Survey list' });
    expect(within(list).getByText(/10 completed responses/)).toBeVisible();
    expect(within(list).getByText(/Students/)).toBeVisible();
    unmount();
    renderWithProviders(<Routes><Route path="/quality/surveys/:id" element={<SurveyDetailsPage />} /></Routes>, { route: '/quality/surveys/7' });
    expect(await screen.findByRole('heading', { name: 'Clinical training' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Response settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add question' })).not.toBeInTheDocument();
  });

  it('lets quality managers close a finding with evidence from the register', async () => {
    localStorage.setItem('cdms.locale', 'en');
    const requests: Array<{ url: string; body: any }> = [];
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(user(true));
      if (url.includes('/quality-options')) return response({ owners: [] });
      if (url.includes('/quality-operations')) return response({ findings: [{ id: 4, reference: 'QF-004', source: 'Audit', title: 'Missing evidence', description: 'One record', severity: 'high', status: 'open', is_recurring: false, due_date: '2026-10-10T00:00:00.000000Z' }], evidence: [] });
      if (url.includes('/sanctum/csrf-cookie')) return response({});
      if (url.includes('/quality-findings/4') && init?.method === 'PUT') { requests.push({ url, body: JSON.parse(String(init.body)) }); return response({ id: 4 }); }
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<QualityOperationsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Update finding' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Due date')).toHaveValue('2026-10-10');
    await userEvent.selectOptions(within(dialog).getByLabelText('Status'), 'closed');
    await userEvent.type(within(dialog).getByLabelText('Resolution evidence reference'), 'Council minutes 12');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toMatchObject({ status: 'closed', evidence_reference: 'Council minutes 12', due_date: '2026-10-10' });
  });

  it('opens the evidence register directly on expired records from the dashboard', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(user());
      if (url.includes('/quality-options')) return response({ owners: [] });
      if (url.includes('/quality-operations')) return response({ findings: [], evidence: [
        { id: 1, code: 'EVD-1', title: 'Expired policy', status: 'approved', expires_at: '2020-01-01T00:00:00.000000Z' },
        { id: 2, code: 'EVD-2', title: 'Current policy', status: 'approved', expires_at: '2099-01-01T00:00:00.000000Z' },
      ] });
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<QualityOperationsPage />, { route: '/quality/operations?tab=evidence&filter=expired' });
    expect(await screen.findByText('Expired policy')).toBeVisible();
    expect(screen.queryByText('Current policy')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Evidence status' })).toHaveValue('expired');
  });

  it('edits an improvement plan without losing its due date', async () => {
    localStorage.setItem('cdms.locale', 'en');
    const requests: any[] = [];
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(user(true));
      if (url.includes('/quality-options')) return response({ academic_years: [], owners: [], kpis: [], surveys: [], findings: [] });
      if (url.includes('/quality-improvement-plans?')) return response([{ id: 6, source: 'Audit', observation: 'Missing documentation', improvement_action: 'Complete records', responsible: 'Coordinator', priority: 'high', status: 'in_progress', progress_percent: 20, due_date: '2026-10-20T00:00:00.000000Z' }], { total: 1 });
      if (url.includes('/sanctum/csrf-cookie')) return response({});
      if (url.includes('/quality-improvement-plans/6') && init?.method === 'PUT') { requests.push(JSON.parse(String(init.body))); return response({ id: 6 }); }
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<ImprovementPlansPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit plan' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Due date')).toHaveValue('2026-10-20');
    await userEvent.type(within(dialog).getByLabelText('Root cause'), 'No assigned owner');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save plan' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({ due_date: '2026-10-20', root_cause: 'No assigned owner' });
  });

  it('shows KPI evidence before approving a submitted measurement', async () => {
    localStorage.setItem('cdms.locale', 'en');
    const requests: any[] = [];
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(user(true));
      if (url.includes('/quality-options')) return response({ academic_years: [] });
      if (url.includes('/quality-kpis?')) return response([{ id: 8, code: 'KPI-0008', name: 'Student satisfaction', target_value: '80%', latest_measurement: { id: 22, measured_at: '2026-10-07T00:00:00.000000Z', display_value: '84%', numeric_value: '84', achievement_status: 'achieved', review_status: 'submitted', evidence: 'Survey report 2026' }, measurements: [] }], { total: 1 });
      if (url.includes('/sanctum/csrf-cookie')) return response({});
      if (url.includes('/quality-kpi-measurements/22/review') && init?.method === 'POST') { requests.push(JSON.parse(String(init.body))); return response({ id: 22 }); }
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<KpiPage />);
    expect(await screen.findByText('Pending review')).toBeVisible();
    expect(screen.queryByText('Achieved')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Survey report 2026')).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(requests).toEqual([{ decision: 'approved', review_notes: null }]));
  });

  it('offers a retry when one-per-device survey eligibility cannot be checked', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(null);
      if (url.includes('/public/quality-surveys/survey-id/eligibility')) return new Response(JSON.stringify({ success: false, data: null, message: 'Unavailable', errors: {}, meta: {} }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/public/quality-surveys/survey-id')) return response({ public_id: 'survey-id', title: 'Training', target_group: 'الطلبة', is_anonymous: true, response_policy: 'one_per_device', questions: [{ id: 1, question_text: 'Rate', question_type: 'rating', is_required: true }] });
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<Routes><Route path="/survey/:publicId" element={<PublicQualitySurveyPage />} /></Routes>, { route: '/survey/survey-id' });
    expect(await screen.findByText('Unable to verify previous response')).toBeVisible();
    expect(screen.getByRole('button', { name: /retry/i })).toBeVisible();
  });

  it('asks a targeted student for a number inside the survey without an email code', async () => {
    localStorage.setItem('cdms.locale', 'en');
    const submissions: any[] = [];
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(null);
      if (url.includes('/sanctum/csrf-cookie')) return response({});
      if (url.includes('/public/quality-surveys/survey-id/submit')) { submissions.push(JSON.parse(String(init?.body))); return response({ submission_id: 'reply-1' }); }
      if (url.includes('/public/quality-surveys/survey-id')) return response({ public_id: 'survey-id', title: 'Training', target_group: 'الطلبة', is_anonymous: true, response_policy: 'one_per_identifier', requires_student_number: true, questions: [{ id: 1, question_text: 'Rate', question_type: 'rating', is_required: true }] });
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<Routes><Route path="/survey/:publicId" element={<PublicQualitySurveyPage />} /></Routes>, { route: '/survey/survey-id' });
    expect(await screen.findByRole('heading', { name: 'Training' })).toBeVisible();
    await userEvent.type(screen.getByLabelText(/University number/), '22310001');
    await userEvent.click(screen.getByLabelText('1'));
    await userEvent.click(screen.getByRole('button', { name: 'Submit responses' }));
    await waitFor(() => expect(submissions[0]?.respondent_identifier).toBe('22310001'));
    expect(await screen.findByText('Your response was received')).toBeVisible();
    expect(screen.queryByText('Verify before opening the survey')).not.toBeInTheDocument();
  });

  it('keeps questions, results and participation in one survey workspace', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(user());
      if (url.includes('/quality-surveys/7/response-matrix')) return response({ survey: { code: 'SUR-0007', title: 'Training', is_anonymous: true }, questions: [{ id: 1, question_text: 'Rate training', question_type: 'rating' }, { id: 2, question_text: 'Best part', question_type: 'single_choice', options: 'Clinic\nTeaching' }], submissions: [{ submission_id: 'one', responded_at: '2026-10-07T10:00:00Z', answers: { 1: 4, 2: 'Clinic' } }] });
      if (url.includes('/quality-surveys/7/participation')) return response({ summary: { fourth: { total: 2, completed: 1 } }, students: [{ id: 1, full_name_ar: 'أحمد', full_name_en: 'Ahmad', university_number: '22310001', academic_level: 'fourth', completed_on: '2026-10-07' }] }, { last_page: 1 });
      if (url.endsWith('/quality-surveys/7')) return response({ id: 7, public_id: 'survey-id', title: 'Training', target_group: 'الطلبة', target_levels: ['fourth'], status: 'open', is_anonymous: true, response_policy: 'one_per_identifier', submissions_count: 1, questions: [{ id: 1, question_text: 'Rate training', question_type: 'rating', is_required: true }] });
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<Routes><Route path="/quality/surveys/:id" element={<SurveyDetailsPage />} /></Routes>, { route: '/quality/surveys/7' });
    expect(await screen.findByText('Rate training')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /Results & responses/ }));
    expect(await screen.findByRole('region', { name: 'Score summary' })).toHaveTextContent('4.0');
    expect(screen.getByRole('region', { name: 'Choice distribution' })).toHaveTextContent('100%');
    await userEvent.click(screen.getByRole('button', { name: 'Student participation' }));
    expect(await screen.findByText('Ahmad')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Training' })).toBeVisible();
  });

  it('edits the respondent introduction and closing date without leaving the survey', async () => {
    localStorage.setItem('cdms.locale', 'en');
    const saves: any[] = [];
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(user(true));
      if (url.includes('/sanctum/csrf-cookie')) return response({});
      if (url.endsWith('/quality-surveys/7') && init?.method === 'PUT') { saves.push(JSON.parse(String(init.body))); return response({ id: 7 }); }
      if (url.endsWith('/quality-surveys/7')) return response({ id: 7, public_id: 'survey-id', title: 'Training', target_group: 'Faculty', purpose: 'Old introduction', status: 'draft', is_anonymous: true, response_policy: 'multiple', questions: [] });
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<Routes><Route path="/quality/surveys/:id" element={<SurveyDetailsPage />} /></Routes>, { route: '/quality/surveys/7' });
    await userEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    const settings = screen.getByRole('region', { name: 'Survey settings' });
    await userEvent.clear(within(settings).getByLabelText('Description shown to respondents'));
    await userEvent.type(within(settings).getByLabelText('Description shown to respondents'), 'Clear introduction');
    await userEvent.type(within(settings).getByLabelText('Last response date (optional)'), '2026-12-31');
    await userEvent.click(within(settings).getByRole('button', { name: 'Save form details' }));
    await waitFor(() => expect(saves[0]).toMatchObject({ title: 'Training', purpose: 'Clear introduction', closes_at: '2026-12-31' }));
  });

  it('shows the questions immediately for identifier-limited surveys', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(null);
      if (url.includes('/public/quality-surveys/survey-id')) return response({ public_id: 'survey-id', title: 'Staff feedback', target_group: 'Faculty', is_anonymous: true, response_policy: 'one_per_identifier', questions: [{ id: 1, question_text: 'Your view', question_type: 'short_text', is_required: true }] });
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<Routes><Route path="/survey/:publicId" element={<PublicQualitySurveyPage />} /></Routes>, { route: '/survey/survey-id' });
    expect(await screen.findByRole('heading', { name: 'Staff feedback' })).toBeVisible();
    expect(screen.getByLabelText('Your view')).toBeVisible();
    expect(screen.queryByText('Verify before opening the survey')).not.toBeInTheDocument();
  });

  it('points the respondent to an unanswered required checkbox question', async () => {
    localStorage.setItem('cdms.locale', 'en');
    const submitRequest = vi.fn();
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(null);
      if (url.includes('/public/quality-surveys/survey-id/submit')) { submitRequest(); return response({}); }
      if (url.includes('/public/quality-surveys/survey-id')) return response({ public_id: 'survey-id', title: 'Feedback', target_group: 'Students', is_anonymous: true, response_policy: 'multiple', questions: [{ id: 8, question_text: 'Choose improvements', question_type: 'multiple_choice', options: 'Teaching\nFacilities', is_required: true }] });
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<Routes><Route path="/survey/:publicId" element={<PublicQualitySurveyPage />} /></Routes>, { route: '/survey/survey-id' });
    expect(await screen.findByRole('heading', { name: 'Feedback' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Submit responses' }));
    expect(screen.getByRole('alert')).toHaveTextContent('This question is required.');
    expect(submitRequest).not.toHaveBeenCalled();
  });

  it('shows cohort participation separately from anonymous answers', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(user());
      if (url.includes('/quality-surveys/7/participation')) return response({ summary: { fourth: { total: 2, completed: 1 }, fifth: { total: 1, completed: 0 } }, students: [{ id: 1, full_name_ar: 'أحمد', full_name_en: 'Ahmad', university_number: '22310001', academic_level: 'fourth', completed_on: '2026-10-07' }, { id: 2, full_name_ar: 'ليلى', full_name_en: 'Layla', university_number: '22310002', academic_level: 'fourth', completed_on: null }] }, { last_page: 1 });
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<Routes><Route path="/quality/surveys/:id/participation" element={<SurveyParticipationPage />} /></Routes>, { route: '/quality/surveys/7/participation' });
    expect(await screen.findByText('Ahmad')).toBeVisible();
    expect(screen.getByText('Layla')).toBeVisible();
    expect(screen.getByText(/Only completion status/)).toBeVisible();
    expect(screen.getAllByText('1 / 2').length).toBeGreaterThan(0);
  });
});

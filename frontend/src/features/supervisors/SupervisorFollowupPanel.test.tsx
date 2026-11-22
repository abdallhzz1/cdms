import { afterEach, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { SupervisorFollowupPanel } from './SupervisorFollowupPanel';

const envelope = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); });

it('lets a supervisor send an excuse from the compact form with an attachment', async () => {
  localStorage.setItem('cdms.locale', 'en');
  let payload: FormData | undefined;
  vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) return envelope({ id: 7, roles: ['CLINICAL_SUPERVISOR'], permissions: [] });
    if (url.includes('/csrf-cookie')) return new Response(null, { status: 204 });
    if (url.endsWith('/supervisor-followup') && init?.method === 'POST') { payload = init.body as FormData; return envelope({ id: 1 }, 201); }
    if (url.includes('/supervisor-followup?')) return envelope({ items: [], current_page: 1, last_page: 1, total: 0 });
    throw new Error(`Unexpected ${url}`);
  });
  renderWithProviders(<SupervisorFollowupPanel supervisorId={7} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Submit excuse' }));
  expect(screen.queryByLabelText('Record type')).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Date'), '2026-11-22');
  await userEvent.type(screen.getByLabelText('Title'), 'Medical appointment');
  await userEvent.type(screen.getByLabelText('Details'), 'Please review my evidence.');
  await userEvent.upload(screen.getByLabelText(/Attachments/), new File(['pdf'], 'excuse.pdf', { type: 'application/pdf' }));
  await userEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
  await waitFor(() => expect(payload).toBeDefined());
  expect(payload?.get('supervisor_user_id')).toBe('7');
  expect(payload?.get('type')).toBe('excuse');
  expect((payload?.get('files[]') as File).name).toBe('excuse.pdf');
  expect(await screen.findByRole('status')).toHaveTextContent('Record saved');
});

it('shows a reviewer an inbox with expandable details and records a decision', async () => {
  localStorage.setItem('cdms.locale', 'en');
  let reviewed: unknown;
  vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) return envelope({ id: 2, roles: ['CLINICAL_DIRECTOR'], permissions: [{ code: 'supervisor_records.review', scope: 'global' }] });
    if (url.includes('/csrf-cookie')) return new Response(null, { status: 204 });
    if (url.endsWith('/supervisor-followup/1/review')) { reviewed = JSON.parse(String(init?.body)); return envelope({}); }
    if (url.includes('/supervisor-followup?')) return envelope({ current_page: 1, last_page: 1, total: 1, items: [{ id: 1, supervisor_user_id: 7, title: 'Medical excuse', type: 'excuse', status: 'submitted', record_date: '2026-11-22', body: 'Evidence submitted', created_at: '2026-11-22', supervisor: { id: 7, name: 'Dr Supervisor' }, author: { name: 'Dr Supervisor' }, visible_to_supervisor: true, files: [], can_review: true, can_delete: false }] });
    throw new Error(`Unexpected ${url}`);
  });
  renderWithProviders(<SupervisorFollowupPanel />);
  await userEvent.click(await screen.findByText('Medical excuse'));
  await userEvent.click(screen.getByRole('button', { name: 'Review excuse' }));
  await userEvent.selectOptions(screen.getByLabelText('Decision'), 'rejected');
  await userEvent.type(screen.getByLabelText('Decision reason / review note'), 'Evidence incomplete');
  await userEvent.click(screen.getByRole('button', { name: 'Record decision' }));
  await waitFor(() => expect(reviewed).toEqual({ decision: 'rejected', review_note: 'Evidence incomplete' }));
});

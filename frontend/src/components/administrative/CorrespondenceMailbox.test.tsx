import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { CorrespondenceMailbox } from './CorrespondenceMailbox';

const response = (data: unknown, meta: Record<string, unknown> = {}) => new Response(JSON.stringify({ success: true, data, message: null, errors: {}, meta }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const user = { id: 4, name: 'Supervisor', email: 'supervisor@hebron.edu', roles: ['CLINICAL_SUPERVISOR'], permissions: [{ code: 'correspondence.view', scope: 'global' }, { code: 'correspondence.create', scope: 'global' }] };

afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

describe('CorrespondenceMailbox', () => {
  it('shows a focused message row, folder navigation and compose controls without the wide mailbox grid', async () => {
    window.localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return response(user);
      if (url.includes('/users/lookup')) return response([{ id: 9, name: 'Director', email: 'director@hebron.edu' }]);
      if (url.includes('/correspondence?')) return response([{ id: 12, subject: 'Clinical schedule update', correspondence_date: '2026-09-27T08:00:00Z', mail_unread: true, sender: { id: 9, name: 'Director', email: 'director@hebron.edu' }, latest_message: { body: '<p>Please review the schedule.</p>' }, attachments_count: 1 }], { last_page: 1, total: 1, unread: 1, drafts: 0, starred: 0 });
      throw new Error(`Unmocked request: ${url}`);
    });

    renderWithProviders(<CorrespondenceMailbox mode="inbox" />, { route: '/inbox' });
    expect(await screen.findByRole('link', { name: /Director.*Clinical schedule update.*Please review the schedule/ })).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Mail folders' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Select Clinical schedule update' })).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Compose' }));
    expect(screen.getByRole('textbox', { name: 'Message body' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Close message composer' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'CC' })).toBeVisible();
  });
});

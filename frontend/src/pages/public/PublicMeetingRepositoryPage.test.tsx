import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import { PublicMeetingRepositoryPage } from './PublicMeetingRepositoryPage';

const envelope = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, data, message: null, errors: {}, meta: {} }), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.restoreAllMocks());

describe('public meeting repository', () => {
  it('shows linked minutes and downloadable files without an account', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope(null, 401);
      if (url.includes('/public/meeting-repositories/share-token')) return envelope({
        title: 'Faculty council archive', description: 'Approved minutes', allow_download: true,
        meetings: [{ id: 1, minutes_number: 'MTG-001', meeting_type: 'Faculty Council', meeting_date: '2026-09-14', agenda: 'Agenda', discussion_summary: 'Discussion', decisions_summary: 'Decision' }],
        files: [{ id: 3, original_name: 'minutes.pdf', mime_type: 'application/pdf', file_size: 2048 }],
      });
      throw new Error(`Unmocked request: ${url}`);
    });

    renderWithProviders(<Routes><Route path="/shared/meeting-repositories/:token" element={<PublicMeetingRepositoryPage/>}/></Routes>, { route: '/shared/meeting-repositories/share-token' });

    expect(await screen.findByRole('heading', { name: 'Faculty council archive' })).toBeVisible();
    expect(screen.getByText('Decision')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/api/v1/public/meeting-repositories/share-token/files/3');
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('href', '/api/v1/public/meeting-repositories/share-token/files/3?download=1');
  });
});

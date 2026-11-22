import { afterEach, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ClinicalSupervisorProfilePage } from './ClinicalSupervisorProfilePage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); });

it('uses server capabilities for staff editing and adds uploaded documents without an empty list item', async () => {
  localStorage.setItem('cdms.locale', 'en');
  let uploaded = false;
  const doc = { id: 'doc-1', name: 'Certificate', category: 'academic_degree', file_url: '/api/v1/clinical-supervisors/7/documents/doc-1/download', file_type: 'pdf', created_at: '2026-11-22' };
  vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) return envelope({ id: 2, name: 'Staff', roles: ['ADMIN_ASSISTANT'], permissions: [] });
    if (url.includes('/csrf-cookie')) return new Response(null, { status: 204 });
    if (url.endsWith('/clinical-supervisors/7/documents') && init?.method === 'POST') { uploaded = true; return envelope(doc); }
    if (url.endsWith('/clinical-supervisors/7')) return envelope({
      id: '7', user_id: 7, name: 'المشرف', name_en: 'Supervisor', email: 'supervisor@example.edu', department_name: 'Medicine', title: 'Doctor',
      publications: [], conferences: [], documents: uploaded ? [doc] : [],
      capabilities: { edit: true, edit_official: true, documents_view: true, documents_upload: true, documents_delete: false },
    });
    throw new Error(`Unexpected ${url}`);
  });
  renderWithProviders(<Routes><Route path="/clinical-supervisors/:id" element={<ClinicalSupervisorProfilePage />} /></Routes>, { route: '/clinical-supervisors/7' });
  expect(await screen.findByRole('button', { name: 'Edit profile' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Documents' }));
  await userEvent.click(screen.getByRole('button', { name: 'Upload document' }));
  await userEvent.type(screen.getByPlaceholderText('Example: surgery board certificate'), 'Certificate');
  const input = document.querySelector('input[accept*=".pdf"]') as HTMLInputElement;
  await userEvent.upload(input, new File(['pdf'], 'certificate.pdf', { type: 'application/pdf' }));
  const submit = document.querySelector('button[type="submit"]') as HTMLButtonElement;
  await userEvent.click(submit);
  await waitFor(() => expect(uploaded).toBe(true));
  expect(await screen.findByText('Certificate')).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('shows a retryable error when loading a forbidden profile instead of an endless spinner', async () => {
  localStorage.setItem('cdms.locale', 'en');
  vi.spyOn(window, 'fetch').mockImplementation(async input => String(input).endsWith('/auth/me')
    ? envelope({ id: 2, roles: [], permissions: [] })
    : new Response(JSON.stringify({ success: false, message: 'Forbidden', errors: {} }), { status: 403 }));
  renderWithProviders(<Routes><Route path="/clinical-supervisors/:id" element={<ClinicalSupervisorProfilePage />} /></Routes>, { route: '/clinical-supervisors/7' });
  expect(await screen.findByRole('button', { name: /retry|try again/i })).toBeVisible();
});

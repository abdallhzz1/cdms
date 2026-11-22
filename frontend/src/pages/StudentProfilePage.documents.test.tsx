import { afterEach, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import { StudentProfilePage } from './StudentProfilePage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, meta: {}, message: null }), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); });

it('fetches student documents using the logged-in session and shows download errors in the profile', async () => {
  localStorage.setItem('cdms.locale', 'en');
  let downloadOptions: RequestInit | undefined;
  vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) return envelope({ id: 1, roles: ['RTA'], permissions: [{ code: 'students.view', scope: 'global' }] });
    if (url.endsWith('/students/7/documents/doc-1')) {
      downloadOptions = init;
      return new Response(JSON.stringify({ success: false, message: 'File is no longer available.', errors: {} }), { status: 404 });
    }
    if (url.endsWith('/students/7')) return envelope({
      id: 7, full_name_en: 'Student', full_name_ar: 'طالب', university_number: '123',
      documents: [{ id: 'doc-1', title: 'Private attachment', file_name: 'file.pdf', download_url: '/api/v1/students/7/documents/doc-1' }],
    });
    if (url.includes('/student-course-enrollments?')) return envelope([]);
    throw new Error(`Unexpected request: ${url}`);
  });
  renderWithProviders(<Routes><Route path="/students/:id" element={<StudentProfilePage />} /></Routes>, { route: '/students/7' });
  await userEvent.click(await screen.findByRole('button', { name: /Documents/ }));
  expect(screen.queryByRole('link', { name: /Preview/ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Download Private attachment' }));
  await waitFor(() => expect(downloadOptions?.credentials).toBe('include'));
  expect(await screen.findByRole('alert')).toHaveTextContent('File is no longer available.');
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DirectoryPage } from './DirectoryPage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); });

describe('student directory email action', () => {
  it('opens the resolved student address from both table and phone card without requiring edit access', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 4, roles: ['RTA'], assigned_levels: ['fifth'], permissions: [{ code: 'students.view', scope: 'global' }] });
      if (url.includes('/students/main-groups')) return envelope([]);
      if (url.includes('/students?')) return envelope([{ id: 11, university_number: '22310455', full_name_ar: 'طالب سريري', full_name_en: 'Clinical Student', academic_level: 'fifth', university_email: '22310000@students.hebron.edu', resolved_university_email: '22310455@students.hebron.edu', registration_status: 'active' }]);
      throw new Error(`Unmocked request: ${url}`);
    });

    renderWithProviders(<DirectoryPage kind="students" />, { route: '/directory' });
    const links = await screen.findAllByRole('link', { name: 'Email student Clinical Student' });
    expect(links).toHaveLength(2);
    links.forEach(link => expect(link).toHaveAttribute('href', 'mailto:22310455@students.hebron.edu'));
    expect(screen.queryByRole('button', { name: 'Edit student' })).not.toBeInTheDocument();
  });

  it('does not create a mail link when the record has no usable address', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 4, roles: ['RTA'], assigned_levels: ['fifth'], permissions: [{ code: 'students.view', scope: 'global' }] });
      if (url.includes('/students/main-groups')) return envelope([]);
      if (url.includes('/students?')) return envelope([{ id: 11, university_number: '22310455', full_name_ar: 'طالب سريري', full_name_en: 'Clinical Student', academic_level: 'fifth', university_email: null, resolved_university_email: null, registration_status: 'active' }]);
      throw new Error(`Unmocked request: ${url}`);
    });

    renderWithProviders(<DirectoryPage kind="students" />, { route: '/directory' });
    expect((await screen.findAllByText('No email')).length).toBe(2);
    expect(screen.queryByRole('link', { name: /Email student/ })).not.toBeInTheDocument();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DirectoryPage } from './DirectoryPage';

const envelope = (data: unknown, meta: Record<string, unknown> = {}) => new Response(JSON.stringify({ success: true, data, message: null, meta }), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); });

describe('student directory email action', () => {
  it('filters tracked survey participation in the student directory', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 4, roles: ['QUALITY'], assigned_levels: [], permissions: [{ code: 'students.view', scope: 'global' }, { code: 'quality.view', scope: 'global' }] });
      if (url.includes('/quality-surveys/participation-options')) return envelope([{ id: 7, title: 'Training survey', target_levels: ['fourth', 'fifth'] }]);
      if (url.includes('/students/main-groups')) return envelope([]);
      if (url.includes('/students?')) return envelope([{ id: 11, university_number: '22310455', full_name_ar: 'طالب سريري', full_name_en: 'Clinical Student', academic_level: 'fifth', registration_status: 'active', quality_survey_status: new URL(url, 'http://localhost').searchParams.has('quality_survey_id') ? 'completed' : undefined }]);
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<DirectoryPage kind="students" />, { route: '/directory' });
    await userEvent.selectOptions(await screen.findByLabelText('Survey participation'), '7');
    expect((await screen.findAllByText('Survey completed')).length).toBeGreaterThan(0);
    await userEvent.selectOptions(screen.getByLabelText('Participation'), 'pending');
    expect(screen.getByLabelText('Participation')).toHaveValue('pending');
  });

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
    links.forEach(link => {
      const url = new URL(link.getAttribute('href') || '');
      expect(url.origin).toBe('https://mail.google.com');
      expect(url.searchParams.get('to')).toBe('22310455@students.hebron.edu');
      expect(link).toHaveAttribute('target', '_blank');
    });
    expect(screen.queryByRole('button', { name: 'Edit student' })).not.toBeInTheDocument();
  });

  it('prepares a whole cohort or selected main group in Gmail Bcc', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 4, roles: ['RTA'], assigned_levels: ['fifth'], permissions: [{ code: 'students.view', scope: 'global' }] });
      if (url.includes('/students/main-groups')) return envelope(['L']);
      if (url.includes('/students/email-recipients?')) {
        const selectedGroup = new URL(url, 'http://localhost').searchParams.get('main_group_code');
        const emails = selectedGroup ? ['l@students.hebron.edu'] : ['l@students.hebron.edu', 'm@students.hebron.edu'];
        return envelope({ total_students: emails.length, recipient_count: emails.length, missing_email_count: 0, duplicate_email_count: 0, emails });
      }
      if (url.includes('/students?')) return envelope([{ id: 11, university_number: '22310455', full_name_ar: 'طالب سريري', full_name_en: 'Clinical Student', academic_level: 'fifth', resolved_university_email: 'l@students.hebron.edu', registration_status: 'active' }]);
      throw new Error(`Unmocked request: ${url}`);
    });

    renderWithProviders(<DirectoryPage kind="students" />, { route: '/directory' });
    await userEvent.click(await screen.findByRole('button', { name: 'Email students' }));
    const dialog = screen.getByRole('dialog', { name: 'Email students' });
    expect(await within(dialog).findByText('2 email recipients')).toBeVisible();
    let gmail = new URL(within(dialog).getByRole('link', { name: 'Open Gmail' }).getAttribute('href') || '');
    expect(gmail.searchParams.get('to')).toBeNull();
    expect(gmail.searchParams.get('bcc')).toBe('l@students.hebron.edu,m@students.hebron.edu');
    await userEvent.selectOptions(within(dialog).getByLabelText('Recipient group'), 'L');
    expect(await within(dialog).findByText('1 email recipients')).toBeVisible();
    gmail = new URL(within(dialog).getByRole('link', { name: 'Open Gmail' }).getAttribute('href') || '');
    expect(gmail.searchParams.get('bcc')).toBe('l@students.hebron.edu');
  });

  it('prepares every accessible cohort in one Gmail draft', async () => {
    localStorage.setItem('cdms.locale', 'en');
    const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 4, roles: ['SYS_ADMIN'], assigned_levels: [], permissions: [{ code: 'students.view', scope: 'global' }] });
      if (url.includes('/students/main-groups')) return envelope([]);
      if (url.includes('/students/email-recipients?')) return envelope({ total_students: 3, recipient_count: 3, missing_email_count: 0, duplicate_email_count: 0, emails: ['fourth@students.hebron.edu', 'fifth@students.hebron.edu', 'sixth@students.hebron.edu'] });
      if (url.includes('/students?')) return envelope([]);
      throw new Error('Unmocked request: ' + url);
    });

    renderWithProviders(<DirectoryPage kind="students" />, { route: '/directory' });
    await userEvent.click(await screen.findByRole('button', { name: 'Email students' }));
    const dialog = screen.getByRole('dialog', { name: 'Email students' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Recipient cohort'), 'all');
    expect(await within(dialog).findByText('3 email recipients')).toBeVisible();
    const gmail = new URL(within(dialog).getByRole('link', { name: 'Open Gmail' }).getAttribute('href') || '');
    expect(gmail.searchParams.get('bcc')).toBe('fourth@students.hebron.edu,fifth@students.hebron.edu,sixth@students.hebron.edu');
    expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('academic_level=all'))).toBe(true);
  });

  it('keeps individually selected students across cohorts and excludes missing addresses', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 4, roles: ['SYS_ADMIN'], assigned_levels: [], permissions: [{ code: 'students.view', scope: 'global' }] });
      if (url.includes('/students/main-groups')) return envelope([]);
      if (url.includes('/students?')) {
        const params = new URL(url, 'http://localhost').searchParams;
        if (params.get('per_page') === '20') {
          const fifth = params.get('academic_level') === 'fifth';
          return envelope(fifth
            ? [{ id: 22, university_number: '22220022', full_name_ar: 'طالبة ثانية', full_name_en: 'Second Student', academic_level: 'fifth', resolved_university_email: 'second@students.hebron.edu' }]
            : [
              { id: 11, university_number: '22110011', full_name_ar: 'طالبة أولى', full_name_en: 'First Student', academic_level: 'fourth', resolved_university_email: 'first@students.hebron.edu' },
              { id: 33, university_number: '22330033', full_name_ar: 'بدون بريد', full_name_en: 'No Address', academic_level: 'sixth', resolved_university_email: null },
            ], { last_page: 1 });
        }
        return envelope([]);
      }
      throw new Error('Unmocked request: ' + url);
    });

    renderWithProviders(<DirectoryPage kind="students" />, { route: '/directory' });
    await userEvent.click(await screen.findByRole('button', { name: 'Email students' }));
    const dialog = screen.getByRole('dialog', { name: 'Email students' });
    await userEvent.click(within(dialog).getByRole('tab', { name: 'Specific students' }));
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: 'Select student First Student' }));
    expect(within(dialog).getByRole('checkbox', { name: 'Select student No Address' })).toBeDisabled();
    await userEvent.selectOptions(within(dialog).getByLabelText('Filter student cohort'), 'fifth');
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: 'Select student Second Student' }));
    expect(within(dialog).getByText('2 unique addresses in the draft')).toBeVisible();
    const gmail = new URL(within(dialog).getByRole('link', { name: 'Open Gmail' }).getAttribute('href') || '');
    expect(gmail.searchParams.get('bcc')).toBe('first@students.hebron.edu,second@students.hebron.edu');
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

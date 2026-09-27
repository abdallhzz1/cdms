import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { MyProfilePage } from './MyProfilePage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, errors: {}, meta: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const user = { id: 1, name: 'Clinical Supervisor', email: 'supervisor@example.com', roles: ['CLINICAL_SUPERVISOR'], permissions: [] };
const profile = {
  id: 1, name: 'Clinical Supervisor', full_name_en: 'Clinical Supervisor', email: 'supervisor@example.com', phone: '0599999999',
  specialty: 'Internal Medicine', academic_degree: 'Clinical Supervisor', avatar_url: null, roles: ['CLINICAL_SUPERVISOR'],
  assigned_levels: ['fourth'], staff_code: 'HIDDEN-STAFF-CODE', completion_percent: 45, missing_fields: ['license_number'],
  department: { name_ar: 'قسم الطب', name_en: 'Medicine Department' }, primary_site: { name_ar: 'المستشفى', name_en: 'Hospital' },
  capabilities: { professional_profile: true, clinical_supervisor: true, department_head: false },
  employment: { license_number: null, contract_type: 'full_time', contract_start: null, contract_end: null },
  training_sites: [], professional: { bio: null, publications: [], conferences: [], documents: [] },
};

afterEach(() => vi.restoreAllMocks());

describe('MyProfilePage', () => {
  it('keeps the phone overview focused and hides academic affiliation, staff code and empty employment rows', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async input => envelope(String(input).includes('/auth/me') ? user : profile));
    renderWithProviders(<MyProfilePage />, { route: '/profile' });

    expect(await screen.findByRole('heading', { name: 'Clinical Supervisor', level: 1 })).toBeVisible();
    expect(screen.getByText('Personal details')).toBeVisible();
    expect(screen.getByText('Employment information')).toBeVisible();
    expect(screen.getByText('Full time')).toBeVisible();
    expect(screen.queryByText('Academic affiliation')).not.toBeInTheDocument();
    expect(screen.queryByText('Medicine Department')).not.toBeInTheDocument();
    expect(screen.queryByText('HIDDEN-STAFF-CODE')).not.toBeInTheDocument();
    expect(screen.queryByText('License number')).not.toBeInTheDocument();
    expect(screen.queryByText('Contract start')).not.toBeInTheDocument();
    expect(screen.queryByText('Academic degree')).not.toBeInTheDocument();
  });

  it('lets a user reach professional, documents and security sections from the same compact navigation', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async input => envelope(String(input).includes('/auth/me') ? user : profile));
    renderWithProviders(<MyProfilePage />, { route: '/profile' });

    const navigation = await screen.findByRole('navigation', { name: 'Profile sections' });
    await userEvent.click(navigation.querySelectorAll('button')[1]);
    expect(screen.getByText('Professional summary')).toBeVisible();
    await userEvent.click(navigation.querySelectorAll('button')[2]);
    expect(screen.getByText('Upload document')).toBeVisible();
    await userEvent.click(navigation.querySelectorAll('button')[3]);
    expect(screen.getByRole('button', { name: 'Change password' })).toBeVisible();
  });
});

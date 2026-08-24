import { describe, expect, it, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { renderWithProviders } from '@/test/renderWithProviders';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const UNAUTHENTICATED = { success: false, data: null, message: 'Unauthenticated.', errors: {}, meta: {} };
const HEALTH_OK = { success: true, data: { application: 'ok', database: 'ok' }, message: null, meta: {} };
const AUTHENTICATED_USER = {
  success: true,
  data: { id: 1, name: 'Test Director', email: 'director@cdms.local', roles: ['CLINICAL_DIRECTOR'], permissions: [] },
  message: null,
  meta: {},
};
const LOGIN_INVALID = {
  success: false,
  data: null,
  message: 'The given data was invalid.',
  errors: { email: ['These credentials do not match our records.'] },
  meta: {},
};

/**
 * Covers Prompt 02 §30's required frontend cases 1, 2, 3, 6: login page
 * renders, login success changes auth state, login failure shows a safe
 * error, RTL/LTR works on the login page. Case 4 (protected route redirect)
 * is covered by App.test.tsx; cases 5/7 (logout, permission-based UI) by
 * Header.test.tsx.
 */
describe('LoginPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetch(login: () => Response) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/sanctum/csrf-cookie')) return new Response(null, { status: 204 });
        if (url.includes('/auth/login')) return login();
        if (url.includes('/auth/me')) return jsonResponse(UNAUTHENTICATED, 401);
        if (url.includes('/health')) return jsonResponse(HEALTH_OK);
        throw new Error(`Unmocked fetch call to ${url}`);
      }),
    );
  }

  it('renders the login form', async () => {
    mockFetch(() => jsonResponse(AUTHENTICATED_USER));
    renderWithProviders(<App />, { route: '/login' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('changes auth state and navigates in after a successful login', async () => {
    mockFetch(() => jsonResponse(AUTHENTICATED_USER));
    renderWithProviders(<App />, { route: '/login' });

    await waitFor(() => screen.getByLabelText(/email address/i));

    await userEvent.type(screen.getByLabelText(/email address/i), 'director@cdms.local');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'correct-password');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /أهلاً بك/ })).toBeInTheDocument();
    });
  });

  it('shows a safe, generic error message on login failure without navigating', async () => {
    mockFetch(() => jsonResponse(LOGIN_INVALID, 422));
    renderWithProviders(<App />, { route: '/login' });

    await waitFor(() => screen.getByLabelText(/email address/i));

    await userEvent.type(screen.getByLabelText(/email address/i), 'director@cdms.local');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/incorrect/i);
    // Never echoes the backend's raw field-specific validation message —
    // only the frontend's own generic copy.
    expect(alert.textContent).not.toMatch(/does not match our records/i);
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });

  it('switches direction to RTL when Arabic is selected on the login page', async () => {
    mockFetch(() => jsonResponse(AUTHENTICATED_USER));
    renderWithProviders(<App />, { route: '/login' });

    const languageButton = await screen.findByRole('button', { name: /English/i });
    await userEvent.click(languageButton);

    await waitFor(() => {
      expect(document.documentElement.dir).toBe('rtl');
      expect(document.documentElement.lang).toBe('ar');
    });

    expect(screen.getByRole('heading', { name: 'تسجيل الدخول' })).toBeInTheDocument();
  });
});

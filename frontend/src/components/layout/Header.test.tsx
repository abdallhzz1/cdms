import { describe, expect, it, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { renderWithProviders } from '@/test/renderWithProviders';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const HEALTH_OK = { success: true, data: { application: 'ok', database: 'ok' }, message: null, meta: {} };

function authenticatedUser(permissions: Array<{ code: string; scope: string }>) {
  return {
    success: true,
    data: { id: 1, name: 'Test Director', email: 'director@cdms.local', roles: ['CLINICAL_DIRECTOR'], permissions },
    message: null,
    meta: {},
  };
}

/**
 * Covers Prompt 02 §30's remaining required frontend cases: 5 (logout
 * clears auth state) and 7 (permission-based UI behavior).
 */
describe('Header (authenticated app shell)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs out and clears auth state, redirecting to login', async () => {
    let meCallCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/sanctum/csrf-cookie')) return new Response(null, { status: 204 });
        if (url.includes('/auth/logout')) return jsonResponse({ success: true, data: null, message: 'Logged out successfully.', meta: {} });
        if (url.includes('/auth/me')) {
          meCallCount += 1;
          return jsonResponse(authenticatedUser([]));
        }
        if (url.includes('/health')) return jsonResponse(HEALTH_OK);
        throw new Error(`Unmocked fetch call to ${url}`);
      }),
    );

    renderWithProviders(<App />, { route: '/' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /أهلاً بك/ })).toBeInTheDocument();
    });
    expect(meCallCount).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: /Test Director Clinical Director/i }));
    await userEvent.click(screen.getByRole('button', { name: /Sign Out/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    });
  });

  it('shows permission-gated UI only for users granted that permission', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/auth/me')) {
          return jsonResponse(authenticatedUser([{ code: 'users.manage', scope: 'global' }]));
        }
        if (url.includes('/health')) return jsonResponse(HEALTH_OK);
        throw new Error(`Unmocked fetch call to ${url}`);
      }),
    );

    renderWithProviders(<App />, { route: '/' });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Users & Roles/i })).toBeInTheDocument();
    });
  });

  it('hides permission-gated UI for users without that permission', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/auth/me')) return jsonResponse(authenticatedUser([]));
        if (url.includes('/health')) return jsonResponse(HEALTH_OK);
        throw new Error(`Unmocked fetch call to ${url}`);
      }),
    );

    renderWithProviders(<App />, { route: '/' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /أهلاً بك/ })).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /Users & Roles/i })).not.toBeInTheDocument();
  });
});

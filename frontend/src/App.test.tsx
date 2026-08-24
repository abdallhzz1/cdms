import { describe, expect, it, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { App } from './App';
import { renderWithProviders } from './test/renderWithProviders';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const HEALTH_OK = { success: true, data: { application: 'ok', database: 'ok' }, message: null, meta: {} };
const UNAUTHENTICATED = { success: false, data: null, message: 'Unauthenticated.', errors: {}, meta: {} };
const AUTHENTICATED_USER = {
  success: true,
  data: { id: 1, name: 'Test Director', email: 'director@cdms.local', roles: ['CLINICAL_DIRECTOR'], permissions: [] },
  message: null,
  meta: {},
};

function mockFetchByUrl(routes: Record<string, () => Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const match = Object.entries(routes).find(([path]) => url.includes(path));
      if (!match) throw new Error(`Unmocked fetch call to ${url}`);
      return match[1]();
    }),
  );
}

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects an unauthenticated visitor to the login page', async () => {
    mockFetchByUrl({
      '/auth/me': () => jsonResponse(UNAUTHENTICATED, 401),
    });

    renderWithProviders(<App />, { route: '/' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    });
  });

  it('loads and renders the Foundation page at the root route for an authenticated user', async () => {
    mockFetchByUrl({
      '/auth/me': () => jsonResponse(AUTHENTICATED_USER),
      '/health': () => jsonResponse(HEALTH_OK),
    });

    renderWithProviders(<App />, { route: '/' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /أهلاً بك/ })).toBeInTheDocument();
    });

  });

  it('renders the not-found page for an unknown route when authenticated', async () => {
    mockFetchByUrl({
      '/auth/me': () => jsonResponse(AUTHENTICATED_USER),
      '/health': () => jsonResponse(HEALTH_OK),
    });

    renderWithProviders(<App />, { route: '/does-not-exist' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
    });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { renderWithProviders } from '@/test/renderWithProviders';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('Sidebar active navigation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks only student group registration active on its route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/auth/me')) {
          return jsonResponse({
            success: true,
            data: {
              id: 1,
              name: 'Test Admin',
              email: 'admin@cdms.local',
              roles: ['SYS_ADMIN'],
              permissions: [
                { code: 'distribution.view', scope: 'global' },
                { code: 'group_registration.view', scope: 'global' },
              ],
            },
            message: null,
            meta: {},
          });
        }
        throw new Error(`Unmocked fetch call to ${url}`);
      }),
    );

    renderWithProviders(<Sidebar />, { route: '/distribution/groups' });

    const distributionLink = await screen.findByRole('link', { name: /^(Distribution|التوزيع السريري)$/i });
    const registrationLink = screen.getByRole('link', { name: /Student Group Registration|تسجيل مجموعات الطلبة/i });

    expect(distributionLink).not.toHaveAttribute('aria-current', 'page');
    expect(registrationLink).toHaveAttribute('aria-current', 'page');
  });
});

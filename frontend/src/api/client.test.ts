import { describe, expect, it, vi, afterEach } from 'vitest';
import { apiFetch, downloadApiFile, ApiError, AUTH_SESSION_EXPIRED_EVENT } from './client';

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the unwrapped data on a successful envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ success: true, data: { foo: 'bar' }, message: null, meta: {} }),
          { status: 200 },
        ),
      ),
    );

    await expect(apiFetch('/anything')).resolves.toEqual({ foo: 'bar' });
  });

  it('throws ApiError with the backend message on an error envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: false,
            data: null,
            message: 'Nope',
            errors: { field: ['required'] },
            meta: {},
          }),
          { status: 422 },
        ),
      ),
    );

    await expect(apiFetch('/anything')).rejects.toMatchObject({
      message: 'Nope',
      status: 422,
    } satisfies Partial<ApiError>);
  });

  it('throws ApiError on a network failure without a status code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await expect(apiFetch('/anything')).rejects.toThrow(/unable to reach the server/i);
  });

  it('fetches a CSRF cookie before a mutating request and echoes it back as a header', async () => {
    document.cookie = 'XSRF-TOKEN=; Max-Age=0'; // ensure a clean slate
    const calls: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        calls.push(url);

        if (url.includes('/sanctum/csrf-cookie')) {
          document.cookie = 'XSRF-TOKEN=test-token-value';
          return new Response(null, { status: 204 });
        }

        expect(new Headers(init?.headers).get('X-XSRF-TOKEN')).toBe('test-token-value');
        expect(init?.credentials).toBe('include');

        return new Response(
          JSON.stringify({ success: true, data: null, message: null, meta: {} }),
          { status: 200 },
        );
      }),
    );

    await apiFetch('/auth/login', { method: 'POST', body: { email: 'a@b.com', password: 'x' } });

    expect(calls.some((url) => url.includes('/sanctum/csrf-cookie'))).toBe(true);

    document.cookie = 'XSRF-TOKEN=; Max-Age=0';
  });

  it('announces an expired authenticated session on a protected 401 response', async () => {
    const listener = vi.fn();
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, listener);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ success: false, data: null, message: 'Unauthenticated.', errors: {}, meta: {} }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(apiFetch('/operational/clinical-schedule')).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, listener);
  });
});

describe('private file downloads', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('downloads through the current API origin with session cookies and the server filename', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(new Blob(['private file']), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': "attachment; filename*=UTF-8''%D9%85%D9%84%D9%81.pdf" },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn(() => 'blob:student-document');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe('blob:student-document');
      expect(this.download).toBe('ملف.pdf');
    });
    await downloadApiFile('https://configured-server.example/api/v1/students/7/documents/doc-1', 'fallback.pdf');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/students/7/documents/doc-1', expect.objectContaining({ credentials: 'include' }));
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Accept')).toBe('application/json');
    expect(click).toHaveBeenCalledOnce();
    await vi.runAllTimersAsync();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:student-document');
  });

  it('reports an authentication failure without saving the JSON response as a file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Session expired', errors: {} }), { status: 401 })));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const listener = vi.fn();
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, listener);
    try {
      await expect(downloadApiFile('/students/7/documents/doc-1', 'test.pdf')).rejects.toMatchObject({ status: 401, message: 'Session expired' });
      expect(click).not.toHaveBeenCalled();
      expect(listener).toHaveBeenCalledOnce();
    } finally { window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, listener); }
  });
});

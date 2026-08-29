/**
 * Centralized API client. Every call to the backend goes through `apiFetch`
 * — components must never call `fetch`/`axios` directly (Prompt 01 §12).
 *
 * Mirrors the backend's standard envelope (App\Http\Responses\ApiResponse):
 *   success: { success: true,  data, message, meta }
 *   error:   { success: false, data: null, message, errors, meta }
 */

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  message: string | null;
  meta: Record<string, unknown>;
}

export interface ApiErrorEnvelope {
  success: false;
  data: null;
  message: string;
  errors: Record<string, unknown>;
  meta: Record<string, unknown>;
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

/**
 * Thrown for both transport failures (network down, non-JSON response) and
 * backend-reported errors (`success: false`), so callers can handle both
 * with a single catch.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly errors: Record<string, unknown>;

  constructor(message: string, status: number, errors: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

export function getApiBaseUrl(): string {
  return '/api/v1';
}

export const API_BASE_URL: string = '/api/v1';
export const AUTH_SESSION_EXPIRED_EVENT = 'cdms:auth-session-expired';

export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `/api/v1${cleanPath}`;
}

export function getApiOrigin(): string {
  return '';
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function ensureCsrfCookie(): Promise<void> {
  if (readCookie('XSRF-TOKEN')) return;

  await fetch('/sanctum/csrf-cookie', {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
}

function buildHeaders(init: HeadersInit | undefined, method: string, isFormData = false): Headers {
  const headers = new Headers(init);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (!headers.has('Accept-Language')) {
    const storedLocale = window.localStorage?.getItem('cdms.locale');
    const locale = storedLocale === 'en' || storedLocale === 'ar'
      ? storedLocale
      : (document.documentElement.lang === 'en' ? 'en' : 'ar');
    headers.set('Accept-Language', locale);
  }
  if (!isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  if (MUTATING_METHODS.has(method.toUpperCase())) {
    const token = readCookie('XSRF-TOKEN');
    if (token) headers.set('X-XSRF-TOKEN', token);
  }

  return headers;
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const url = apiUrl(path);
  const method = options.method ?? 'GET';

  if (MUTATING_METHODS.has(method.toUpperCase())) {
    await ensureCsrfCookie();
  }

  const isFormData = options.body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      method,
      // Required so the session + XSRF-TOKEN cookies set by the backend are
      // sent back on every request (Prompt 02 §17: session-cookie auth, no
      // token in localStorage/sessionStorage).
      credentials: 'include',
      headers: buildHeaders(options.headers, method, isFormData),
      body: options.body !== undefined ? (isFormData ? (options.body as FormData) : JSON.stringify(options.body)) : undefined,
    });
  } catch {
    throw new ApiError('Unable to reach the server. Please check your connection.', 0);
  }

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    // Non-JSON response (e.g. an upstream proxy error page) — fall through
    // to the generic status-based error below.
  }

  if (!response.ok || !envelope || envelope.success === false) {
    const message = envelope && 'message' in envelope && envelope.message
      ? envelope.message
      : `Request failed with status ${response.status}.`;
    const errors = envelope && 'errors' in envelope ? envelope.errors : {};
    if (response.status === 401 && path !== '/auth/me' && path !== '/auth/login') {
      window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(message, response.status, errors);
  }

  return envelope.data;
}

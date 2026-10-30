import { API_BASE } from '@shared/app';

/** An error response from the API: `{ error: { code, message, fields? } }` (Section 5). */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

type ErrorBody = { error?: { code?: string; message?: string; fields?: Record<string, string> } };

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    // Same origin, so the HttpOnly session cookie is sent automatically.
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiClientError(0, 'NETWORK', 'No connection. Check your internet and try again.');
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (body as ErrorBody | null)?.error;
    throw new ApiClientError(
      res.status,
      error?.code ?? 'INTERNAL',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.fields,
    );
  }
  return body as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { headers: { accept: 'application/json' } });
}

export function apiPost<T>(path: string, data: unknown = {}): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(data),
  });
}

export function apiPatch<T>(path: string, data: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(data),
  });
}

/** Sends raw image bytes; the type travels in Content-Type (Section 7.8). */
export function apiUpload<T>(path: string, blob: Blob): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'content-type': blob.type, accept: 'application/json' },
    body: blob,
  });
}

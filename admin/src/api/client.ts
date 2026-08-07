const API_BASE = '/wp-json/wp/v2';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = '',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  token = '',
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    let message = `请求失败 (${response.status})`;
    let code = '';
    try {
      const error = (await response.json()) as { code?: string; message?: string; error?: string };
      message = error.message || error.error || message;
      code = error.code || '';
    } catch {
      // Keep the status-based fallback for non-JSON responses.
    }
    throw new ApiError(message, response.status, code);
  }

  return response;
}

export async function apiJson<T>(
  path: string,
  init: RequestInit = {},
  token = '',
): Promise<T> {
  const response = await apiFetch(path, init, token);
  return response.json() as Promise<T>;
}

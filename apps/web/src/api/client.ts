const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  public code: string;
  public details?: unknown;
  public status: number;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('access_token');

  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const json = await response.json().catch(() => null);

  if (!response.ok || (json && json.success === false)) {
    const errorInfo = json?.error || {
      code: 'HTTP_ERROR',
      message: response.statusText || 'Request failed',
    };
    throw new ApiError(errorInfo.message, errorInfo.code, response.status, errorInfo.details);
  }

  return json?.data as T;
}

const API_BASE = import.meta.env.VITE_API_BASE || 'https://autoglass-glass-sok.autoglassnorge.workers.dev';

class ApiError extends Error {
  constructor(public status: number, public data?: unknown) {
    super(`API error: ${status}`);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => undefined);
    throw new ApiError(res.status, data);
  }

  return res.json() as Promise<T>;
}

export { API_BASE, ApiError, fetchApi };

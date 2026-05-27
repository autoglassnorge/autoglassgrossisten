import type { SearchResult } from '@/types/api';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export class SearchError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'SearchError';
  }
}

export async function searchByRegnr(regnr: string): Promise<SearchResult> {
  const res = await fetch(`${API_BASE}/api/glass?regnr=${encodeURIComponent(regnr)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new SearchError(
      body.error ?? `Søk feilet (${res.status})`,
      res.status,
      body.code
    );
  }
  return res.json();
}

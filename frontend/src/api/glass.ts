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

export async function logFeedback(params: {
  regnr: string;
  eurocode: string;
  ktype?: number;
  layer?: number;
  score?: number;
  action: "view" | "cart" | "order";
}): Promise<void> {
  await fetch(`${API_BASE}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

import type { SearchResult } from '@/types/api';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export async function searchByRegnr(regnr: string): Promise<SearchResult> {
  const res = await fetch(`${API_BASE}/api/glass?regnr=${encodeURIComponent(regnr)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Søk feilet (${res.status})`);
  }
  return res.json();
}

import type { SearchResult } from '@/types/api';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export class SearchError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public backupUrl?: string
  ) {
    super(message);
    this.name = 'SearchError';
  }
}

export async function searchByRegnr(regnr: string): Promise<SearchResult> {
  const res = await fetch(`${API_BASE}/api/glass?regnr=${encodeURIComponent(regnr)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    
    // Hvis SVV er nede, prøv scraping fra vegvesen.no
    if (body.code === 'svv_upstream_error') {
      console.log('SVV nede, prøver scraping...');
      const scrapeResult = await scrapeVegvesen(regnr);
      if (scrapeResult.status === 'ok' && scrapeResult.data) {
        return scrapeResult.data;
      }
    }
    
    throw new SearchError(
      body.error ?? `Søk feilet (${res.status})`,
      res.status,
      body.code,
      body.backupUrl
    );
  }
  return res.json();
}

export async function scrapeVegvesen(regnr: string): Promise<{status: string, data?: SearchResult}> {
  try {
    const res = await fetch(`${API_BASE}/api/scrape-vegvesen?regnr=${encodeURIComponent(regnr)}`);
    if (!res.ok) {
      return { status: 'error' };
    }
    const data = await res.json();
    
    if (data.status === 'ok' && data.vehicle) {
      // Konverter til SearchResult format
      // Vi må hente kandidater basert på kjøretøydata
      const searchResult: SearchResult = {
        vehicle: data.vehicle,
        candidates: [], // Vil bli fylt av backend
        confidence: 'medium',
        layer: 3,
      };
      return { status: 'ok', data: searchResult };
    }
    return { status: data.status || 'error' };
  } catch (e) {
    console.error('Scraping feilet:', e);
    return { status: 'error' };
  }
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

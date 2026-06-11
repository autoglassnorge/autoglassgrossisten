import type { SearchResult, CatalogResponse, UserEquipmentAnswers } from '@/types/api';

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

const EQUIPMENT_FIELDS = ['adas', 'rainSensor', 'heated', 'acoustic', 'antenna', 'camera', 'hud'] as const;

function appendEquipmentAnswers(params: URLSearchParams, answers?: UserEquipmentAnswers) {
  if (!answers) return;
  for (const field of EQUIPMENT_FIELDS) {
    const value = answers[field];
    if (value !== undefined) {
      params.set(`eq_${field}`, value ? '1' : '0');
    }
  }
}

export async function searchByRegnr(
  regnr: string,
  equipmentAnswers?: UserEquipmentAnswers,
  position?: 'driver' | 'passenger' | 'center' | 'both'
): Promise<SearchResult> {
  const params = new URLSearchParams({ regnr });
  appendEquipmentAnswers(params, equipmentAnswers);
  if (position) {
    params.set('position', position);
  }
  const res = await fetch(`${API_BASE}/api/glass?${params.toString()}`);
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

export interface IdentifierSearchResponse {
  query: Record<string, string>;
  count: number;
  results: unknown[];
}

export async function searchByEurocode(eurocode: string): Promise<IdentifierSearchResponse> {
  const res = await fetch(`${API_BASE}/api/glass?eurocode=${encodeURIComponent(eurocode)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new SearchError(body.error ?? `Eurocode-søk feilet (${res.status})`, res.status);
  }
  return res.json();
}

export async function searchBySku(sku: string): Promise<IdentifierSearchResponse> {
  const res = await fetch(`${API_BASE}/api/glass?supplier_sku=${encodeURIComponent(sku)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new SearchError(body.error ?? `SKU-søk feilet (${res.status})`, res.status);
  }
  return res.json();
}

export async function searchByOem(oem: string): Promise<IdentifierSearchResponse> {
  const res = await fetch(`${API_BASE}/api/glass?oem=${encodeURIComponent(oem)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new SearchError(body.error ?? `OE-søk feilet (${res.status})`, res.status);
  }
  return res.json();
}

export async function searchCatalogText(query: string): Promise<CatalogResponse> {
  const res = await fetch(`${API_BASE}/api/catalog/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Katalogsøk feilet (${res.status})`);
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

export interface GuideQuestion {
  id: string;
  type: "single_choice" | "boolean" | "multi_choice";
  label: string;
  options?: { value: string; label: string }[];
  reason: string;
}

export interface GuideState {
  step: number;
  question: GuideQuestion | null;
  candidates: number;
  progress: { current: number; total: number };
  recommendation?: SearchResult["candidates"];
  answers?: Record<string, string>;
  vehicle?: SearchResult["vehicle"];
  confidence?: SearchResult["confidence"];
}

export async function guideGlass(
  regnr: string,
  step: number,
  answers: Record<string, string>,
  categoryFilter?: string,
  mode?: "rule" | "llm",
  vin?: string
): Promise<GuideState> {
  const body: Record<string, unknown> = { step, answers, categoryFilter, mode };
  if (vin) body.vin = vin;
  else body.regnr = regnr;

  const res = await fetch(`${API_BASE}/api/glass-guide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new SearchError(
      body.error ?? `Glassveileder feilet (${res.status})`,
      res.status
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

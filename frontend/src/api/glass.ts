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

function parseNagsCodes(result: SearchResult): SearchResult {
  if (result.candidates) {
    result.candidates = result.candidates.map(c => {
      const nagsStr = c.nagsCodes;
      if (typeof nagsStr === 'string') {
        try {
          const parsed: unknown = JSON.parse(nagsStr);
          if (Array.isArray(parsed)) {
            const arr: string[] = parsed.map((x: unknown) => String(x));
            c.nagsCodes = arr;
          } else {
            c.nagsCodes = undefined;
          }
        } catch {
          c.nagsCodes = nagsStr ? [nagsStr] : undefined;
        }
      }
      return c;
    });
  }
  return result;
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
  return parseNagsCodes(await res.json());
}

export async function searchByVin(vin: string): Promise<SearchResult> {
  const res = await fetch(`${API_BASE}/api/glass?vin=${encodeURIComponent(vin)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new SearchError(
      body.error ?? `VIN-søk feilet (${res.status})`,
      res.status,
      body.code
    );
  }
  return parseNagsCodes(await res.json());
}

export async function searchByOem(oem: string): Promise<SearchResult> {
  const res = await fetch(`${API_BASE}/api/glass?oem=${encodeURIComponent(oem)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new SearchError(
      body.error ?? `OEM-søk feilet (${res.status})`,
      res.status,
      body.code
    );
  }
  return parseNagsCodes(await res.json());
}

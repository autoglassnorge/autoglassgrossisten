import type { CatalogResponse, CatalogFilters } from '@/types/api';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export async function fetchCatalog(
  page: number,
  perPage: number,
  filters: CatalogFilters
): Promise<CatalogResponse> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('per_page', String(perPage));

  if (filters.query) params.set('q', filters.query);
  if (filters.brand?.length) params.set('brand', filters.brand.join(','));
  if (filters.category?.length) params.set('category', filters.category.join(','));
  if (filters.yearFrom) params.set('year_from', String(filters.yearFrom));
  if (filters.yearTo) params.set('year_to', String(filters.yearTo));

  const res = await fetch(`${API_BASE}/api/catalog?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Katalog-feil (${res.status})`);
  }
  return res.json();
}

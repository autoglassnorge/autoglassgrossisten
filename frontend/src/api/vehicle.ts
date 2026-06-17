import type { EquipmentProfileResponse } from '@/types/equipment-profile';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export async function fetchEquipmentProfile(
  params: { regnr?: string; brand?: string; model?: string; year?: number; category?: string },
  signal?: AbortSignal
): Promise<EquipmentProfileResponse | null> {
  const searchParams = new URLSearchParams();
  if (params.regnr) searchParams.set('regnr', params.regnr);
  if (params.brand) searchParams.set('brand', params.brand);
  if (params.model) searchParams.set('model', params.model);
  if (params.year !== undefined) searchParams.set('year', String(params.year));
  if (params.category) searchParams.set('category', params.category);

  const res = await fetch(`${API_BASE}/api/vehicle/equipment-profile?${searchParams.toString()}`, {
    signal,
  });
  if (!res.ok) {
    console.warn('Equipment profile fetch failed:', res.status);
    return null;
  }
  return res.json();
}

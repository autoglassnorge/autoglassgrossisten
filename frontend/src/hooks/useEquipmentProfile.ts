import { useQuery } from '@tanstack/react-query';
import { fetchEquipmentProfile } from '@/api/vehicle';

interface UseEquipmentProfileOptions {
  regnr?: string;
  brand?: string;
  model?: string;
  year?: number;
  category?: string;
  enabled?: boolean;
}

export function useEquipmentProfile({
  regnr,
  brand,
  model,
  year,
  category,
  enabled = true,
}: UseEquipmentProfileOptions) {
  return useQuery({
    queryKey: ['equipment-profile', regnr, brand, model, year, category],
    queryFn: ({ signal }) =>
      fetchEquipmentProfile({ regnr, brand, model, year, category }, signal),
    enabled:
      enabled &&
      !!(regnr || (brand && model)) &&
      (regnr ? regnr.length >= 2 : true),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

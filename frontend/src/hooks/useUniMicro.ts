/**
 * useUniMicro — TanStack Query hooks for UNI Micro integration.
 * Currently uses mock data. Replace with real API when endpoint is ready.
 */

import { useQuery } from '@tanstack/react-query';
import { getCustomer, getOrders, getInvoices } from '@/api/uniMicro';

export function useUniMicroCustomer() {
  return useQuery({
    queryKey: ['unimicro', 'customer'],
    queryFn: getCustomer,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUniMicroOrders() {
  return useQuery({
    queryKey: ['unimicro', 'orders'],
    queryFn: getOrders,
    staleTime: 2 * 60 * 1000,
  });
}

export function useUniMicroInvoices() {
  return useQuery({
    queryKey: ['unimicro', 'invoices'],
    queryFn: getInvoices,
    staleTime: 5 * 60 * 1000,
  });
}

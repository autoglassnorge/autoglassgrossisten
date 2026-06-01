import { useState, useCallback } from 'react';
import type { KtypeLookupResponse } from '@/types/api';

interface UseKtypeLookupReturn {
  lookupKtype: (regnr: string) => Promise<KtypeLookupResponse | null>;
  isLoading: boolean;
  error: string | null;
}

export function useKtypeLookup(): UseKtypeLookupReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookupKtype = useCallback(async (regnr: string): Promise<KtypeLookupResponse | null> => {
    if (!regnr || regnr.length < 5) {
      setError('Ugyldig registreringsnummer');
      return null;
    }

    setIsLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`/api/vehicle/ktype/${encodeURIComponent(regnr)}`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, error: 'Fant ikke kjøretøy' };
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data: KtypeLookupResponse = await response.json();
      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Treg respons — prøv igjen');
      } else {
        setError('Kunne ikke slå opp kjøretøy');
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { lookupKtype, isLoading, error };
}

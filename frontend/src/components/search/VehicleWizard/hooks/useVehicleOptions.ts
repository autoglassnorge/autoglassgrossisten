import { useState, useEffect } from 'react';

interface VehicleOptions {
  brands: string[];
  models: string[];
  years: string[];
}

interface UseVehicleOptionsReturn {
  brands: string[];
  models: string[];
  years: string[];
  isLoading: boolean;
  error: string | null;
}

export function useVehicleOptions(
  selectedBrand?: string,
  selectedModel?: string
): UseVehicleOptionsReturn {
  const [options, setOptions] = useState<VehicleOptions>({
    brands: [],
    models: [],
    years: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch brands on mount
  useEffect(() => {
    const fetchBrands = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/vehicle/brands');
        if (!response.ok) throw new Error('Failed to fetch brands');
        const data = await response.json();
        setOptions(prev => ({ ...prev, brands: data.brands || [] }));
      } catch {
        setError('Kunne ikke laste merker');
        // Fallback: empty array, component should handle gracefully
        setOptions(prev => ({ ...prev, brands: [] }));
      } finally {
        setIsLoading(false);
      }
    };

    fetchBrands();
  }, []);

  // Fetch models when brand changes
  useEffect(() => {
    if (!selectedBrand) {
      setOptions(prev => ({ ...prev, models: [], years: [] }));
      return;
    }

    const fetchModels = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/vehicle/models?brand=${encodeURIComponent(selectedBrand)}`);
        if (!response.ok) throw new Error('Failed to fetch models');
        const data = await response.json();
        setOptions(prev => ({ ...prev, models: data.models || [], years: [] }));
      } catch {
        setError('Kunne ikke laste modeller');
        setOptions(prev => ({ ...prev, models: [] }));
      } finally {
        setIsLoading(false);
      }
    };

    fetchModels();
  }, [selectedBrand]);

  // Fetch years when brand and model change
  useEffect(() => {
    if (!selectedBrand || !selectedModel) {
      setOptions(prev => ({ ...prev, years: [] }));
      return;
    }

    const fetchYears = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          brand: selectedBrand,
          model: selectedModel,
        });
        const response = await fetch(`/api/vehicle/years?${params}`);
        if (!response.ok) throw new Error('Failed to fetch years');
        const data = await response.json();
        setOptions(prev => ({ ...prev, years: data.years || [] }));
      } catch {
        setError('Kunne ikke laste årsmodeller');
        setOptions(prev => ({ ...prev, years: [] }));
      } finally {
        setIsLoading(false);
      }
    };

    fetchYears();
  }, [selectedBrand, selectedModel]);

  return {
    brands: options.brands,
    models: options.models,
    years: options.years,
    isLoading,
    error,
  };
}

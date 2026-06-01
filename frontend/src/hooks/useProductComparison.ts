import { useState, useEffect, useCallback } from 'react';

// BrowseProduct type matching the one in BrowsePage.tsx
interface BrowseProduct {
  title: string;
  sku: string | null;
  typeCode: string | null;
  typeCodeRel: string | null;
  price: number | null;
}

interface ComparisonState {
  selectedSkus: string[];
  timestamp: number;
}

const STORAGE_KEY = 'autoglass:compare';
const MAX_PRODUCTS = 3;

export interface UseProductComparisonReturn {
  selectedProducts: BrowseProduct[];
  toggleProduct: (product: BrowseProduct) => void;
  isSelected: (product: BrowseProduct) => boolean;
  clearAll: () => void;
  removeProduct: (sku: string) => void;
  error: string | null;
  clearError: () => void;
}

export function useProductComparison(): UseProductComparisonReturn {
  const [selectedProducts, setSelectedProducts] = useState<BrowseProduct[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: ComparisonState = JSON.parse(stored);
        // Only restore the SKUs, products need to be re-added from context
        // We store minimal data to avoid stale product info
        if (parsed.selectedSkus && Array.isArray(parsed.selectedSkus)) {
          // Products will be populated by the component using the hook
          // For now we just track SKUs
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save to localStorage whenever products change
  useEffect(() => {
    try {
      const state: ComparisonState = {
        selectedSkus: selectedProducts.map(p => p.sku).filter(Boolean) as string[],
        timestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage errors
    }
  }, [selectedProducts]);

  const isSelected = useCallback((product: BrowseProduct): boolean => {
    if (!product.sku) return false;
    return selectedProducts.some(p => p.sku === product.sku);
  }, [selectedProducts]);

  const toggleProduct = useCallback((product: BrowseProduct): void => {
    if (!product.sku) {
      setError('Produktet mangler SKU og kan ikke sammenlignes');
      return;
    }

    setError(null);

    setSelectedProducts(prev => {
      const exists = prev.some(p => p.sku === product.sku);
      
      if (exists) {
        // Remove product
        return prev.filter(p => p.sku !== product.sku);
      }
      
      // Check max limit
      if (prev.length >= MAX_PRODUCTS) {
        setError(`Maks ${MAX_PRODUCTS} produkter kan sammenlignes`);
        return prev;
      }
      
      // Add product
      return [...prev, product];
    });
  }, []);

  const removeProduct = useCallback((sku: string): void => {
    setSelectedProducts(prev => prev.filter(p => p.sku !== sku));
    setError(null);
  }, []);

  const clearAll = useCallback((): void => {
    setSelectedProducts([]);
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  return {
    selectedProducts,
    toggleProduct,
    isSelected,
    clearAll,
    removeProduct,
    error,
    clearError,
  };
}

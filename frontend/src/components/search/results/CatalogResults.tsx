/**
 * CatalogResults — text/catalog search results.
 * Lazy-loaded by SearchShell.
 */

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { searchCatalogText } from '@/api/glass';
import { SearchLensIcon } from '@/components/icons/SearchIcons';
import { ProductCard } from '@/components/catalog/ProductCard';
import type { Product } from '@/types/api';

interface CatalogResultsProps {
  activeQuery: string;
  onDetail: (product: Product) => void;
}

export function CatalogResults({ activeQuery, onDetail }: CatalogResultsProps) {
  const query = useQuery({
    queryKey: ['search', 'text', activeQuery],
    queryFn: () => searchCatalogText(activeQuery),
    enabled: activeQuery.length >= 3,
    retry: 1,
  });

  const data = query.data;
  const total = data?.total ?? 0;
  const products = (data?.products as Product[]) ?? [];

  if (query.isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="h-32 bg-gray-200 animate-pulse" />
            <div className="p-4 space-y-3">
              <div className="h-4 w-20 bg-gray-200 animate-pulse rounded" />
              <div className="h-5 w-full bg-gray-200 animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="flex items-center gap-3">
        <SearchLensIcon className="h-6 w-6 text-gray-600" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Katalogsøk</h2>
          <p className="text-sm text-gray-500">"{activeQuery}"</p>
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-600 mb-2" />
          <p className="font-medium text-amber-800">Ingen treff</p>
          <p className="text-sm text-amber-700 mt-1">Prøv et annet søkeord, eller spør Professor Autoglass.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600">{total} produkt{total !== 1 ? 'er' : ''} funnet</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} onDetail={onDetail} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

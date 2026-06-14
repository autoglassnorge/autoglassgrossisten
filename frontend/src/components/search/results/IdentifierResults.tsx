/**
 * IdentifierResults — eurocode / SKU / OE search results.
 * Lazy-loaded by SearchShell.
 */

import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { searchByEurocode, searchBySku, searchByOem } from '@/api/glass';
import { EurocodeSearchIcon, BarcodeIcon, OeNumberSearchIcon } from '@/components/icons/SearchIcons';
import { ProductCard } from '@/components/catalog/ProductCard';
import type { Product } from '@/types/api';

interface IdentifierResultsProps {
  activeQuery: string;
  queryType: 'eurocode' | 'sku' | 'oe';
  onDetail: (product: Product) => void;
}

function IdentifierResultsInner({ activeQuery, queryType, onDetail }: IdentifierResultsProps) {
  const query = useQuery({
    queryKey: ['search', queryType, activeQuery],
    queryFn: ({ signal }) => {
      if (queryType === 'eurocode') return searchByEurocode(activeQuery, signal);
      if (queryType === 'sku') return searchBySku(activeQuery, signal);
      return searchByOem(activeQuery, signal);
    },
    enabled: activeQuery.length >= 4,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const data = query.data;
  const count = data?.count ?? 0;
  const results = (data?.results as Product[]) ?? [];

  const Icon = queryType === 'eurocode' ? EurocodeSearchIcon : queryType === 'sku' ? BarcodeIcon : OeNumberSearchIcon;
  const title = queryType === 'eurocode' ? 'Eurocode-søk' : queryType === 'sku' ? 'Artikkelnummer-søk' : 'OE-nummer-søk';

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
        <Icon className={`h-6 w-6 ${queryType === 'eurocode' ? 'text-emerald-600' : queryType === 'sku' ? 'text-blue-600' : 'text-purple-600'}`} />
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500 font-mono">{activeQuery}</p>
        </div>
      </div>

      {count === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-600 mb-2" />
          <p className="font-medium text-amber-800">Ingen treff</p>
          <p className="text-sm text-amber-700 mt-1">Vi fant ingen produkter som matcher {activeQuery}.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600">{count} produkt{count !== 1 ? 'er' : ''} funnet</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((product) => (
              <ProductCard key={product.id} product={product} onDetail={onDetail} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export const IdentifierResults = memo(IdentifierResultsInner);

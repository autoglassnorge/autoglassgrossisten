import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { FilterPanel } from '@/components/catalog/FilterPanel';
import { fetchCatalog } from '@/api/catalog';
import type { CatalogFilters } from '@/types/api';

export default function CatalogPage() {
  const [filters, setFilters] = useState<CatalogFilters>({});
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['catalog', filters, searchQuery],
    queryFn: () => fetchCatalog(1, 48, { ...filters, query: searchQuery || undefined }),
  });

  const availableFilters = data?.filters ?? {
    brands: [],
    categories: [],
    years: { min: 1960, max: 2030 },
    prices: { min: 0, max: 150000 },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Katalog</h1>
        <p className="mt-2 text-gray-600">
          {data?.total.toLocaleString('no-NO') ?? '...'} produkter på lager
        </p>
      </div>

      {/* Search bar */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Søk etter eurokode, NAGS, merke eller modell..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-12 text-base"
        />
      </div>

      <div className="flex gap-8">
        {/* Sidebar filters */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <FilterPanel
            filters={filters}
            availableFilters={availableFilters}
            onChange={setFilters}
          />
        </aside>

        {/* Product grid */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-autoglass-blue" />
            </div>
          ) : (
            <ProductGrid products={data?.products ?? []} />
          )}
        </div>
      </div>
    </div>
  );
}

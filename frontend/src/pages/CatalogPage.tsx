import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { FilterPanel } from '@/components/catalog/FilterPanel';
import { BottomSheet } from '@/components/search/BottomSheet';
import { fetchCatalog } from '@/api/catalog';
import { useDebounce } from '@/hooks/useDebounce';
import type { CatalogFilters } from '@/types/api';

export default function CatalogPage() {
  const [filters, setFilters] = useState<CatalogFilters>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['catalog', filters, debouncedSearch, page],
    queryFn: () => fetchCatalog(page, 48, { ...filters, query: debouncedSearch || undefined, sort: filters.sort, order: filters.order }),
  });

  const availableFilters = data?.filters ?? {
    brands: [],
    categories: [],
    years: { min: 1960, max: 2030 },
    prices: { min: 0, max: 150000 },
  };

  const hasActiveFilters =
    filters.brand?.length ||
    filters.category?.length ||
    filters.yearFrom ||
    filters.yearTo ||
    filters.priceMin ||
    filters.priceMax;

  const products = data?.products ?? [];
  const hasMore = data?.hasMore ?? false;

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-4 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Katalog</h1>
        <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600">
          {data?.total.toLocaleString('no-NO') ?? '...'} produkter på lager
        </p>
      </div>

      {/* Search bar + Sort */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Søk etter eurokode, NAGS, merke eller modell..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="pl-10 h-12 sm:h-14 text-base"
          />
        </div>
        <select
          value={`${filters.sort || 'brand'}-${filters.order || 'asc'}`}
          onChange={(e) => {
            const [sort, order] = e.target.value.split('-') as [CatalogFilters['sort'], CatalogFilters['order']];
            setFilters((f) => ({ ...f, sort, order }));
            setPage(1);
          }}
          className="h-12 sm:h-14 rounded-md border px-3 text-sm bg-white"
        >
          <option value="brand-asc">Merke A–Å</option>
          <option value="brand-desc">Merke Å–A</option>
          <option value="price-asc">Pris lav–høy</option>
          <option value="price-desc">Pris høy–lav</option>
          <option value="year-desc">Nyeste først</option>
          <option value="year-asc">Eldste først</option>
        </select>
      </div>

      {/* Mobile filter button */}
      <div className="flex items-center gap-2 mb-4 lg:hidden">
        <Button
          variant="outline"
          className="flex-1 gap-2 min-h-[44px]"
          onClick={() => setFilterOpen(true)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filter
          {hasActiveFilters && (
            <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-autoglass-blue text-[10px] font-bold text-white">
              ✓
            </span>
          )}
        </Button>
      </div>

      <div className="flex gap-6 lg:gap-8">
        {/* Desktop sidebar filters */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <FilterPanel
            filters={filters}
            availableFilters={availableFilters}
            onChange={(f) => { setFilters(f); setPage(1); }}
          />
        </aside>

        {/* Product grid */}
        <div className="flex-1 min-w-0">
          {isLoading && page === 1 ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-autoglass-blue" />
            </div>
          ) : (
            <>
              <ProductGrid products={products} />
              {hasMore && (
                <div className="mt-6 flex justify-center">
                  <Button
                    variant="outline"
                    size="lg"
                    className="min-h-[44px] px-8"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Last flere
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile filter bottom sheet */}
      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter">
        <FilterPanel
          filters={filters}
          availableFilters={availableFilters}
          onChange={(f) => { setFilters(f); }}
        />
        <div className="mt-6 flex gap-2">
          <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => setFilters({})}>
            Nullstill
          </Button>
          <Button className="flex-1 min-h-[44px]" onClick={() => setFilterOpen(false)}>
            Vis resultater
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

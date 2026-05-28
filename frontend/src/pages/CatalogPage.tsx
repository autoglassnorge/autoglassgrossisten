import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { ProductDetail } from '@/components/catalog/ProductDetail';
import { QuickOrderBar } from '@/components/catalog/QuickOrderBar';
import { FilterPanel } from '@/components/catalog/FilterPanel';
import { BottomSheet } from '@/components/search/BottomSheet';
import { fetchCatalog } from '@/api/catalog';
import { useDebounce } from '@/hooks/useDebounce';
import type { CatalogFilters, Product } from '@/types/api';

export default function CatalogPage() {
  const [filters, setFilters] = useState<CatalogFilters>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['catalog', filters, debouncedSearch, page],
    queryFn: () => fetchCatalog(page, 48, { ...filters, query: debouncedSearch || undefined }),
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

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Søk etter eurokode, NAGS, merke eller modell..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          className="pl-10 h-12 sm:h-14 text-base"
        />
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
              <ProductGrid products={products} onDetail={setDetailProduct} />
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

      {/* Product detail modal */}
      <ProductDetail product={detailProduct} onClose={() => setDetailProduct(null)} />

      {/* Quick Order */}
      <QuickOrderBar
        onLookup={async (codes) => {
          const API_BASE = import.meta.env.VITE_API_URL ?? '';
          const res = await fetch(
            `${API_BASE}/api/catalog/bulk-lookup?codes=${codes.join(',')}`
          );
          const data = await res.json();
          return {
            found: data.found || [],
            notFound: data.notFound || [],
          };
        }}
      />

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

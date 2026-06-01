import { useMemo, useCallback } from 'react';
import { X, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ModelSearch } from './ModelSearch';
import { CategoryFilterWithCounts } from './CategoryFilter';
import { cn } from '@/lib/utils';

interface BrowseProduct {
  title: string;
  sku: string | null;
  typeCode: string | null;
  typeCodeRel: string | null;
  price: number | null;
}

interface FilterPanelProps {
  categories: string[]; // ['F', 'B', 'DFF', ...]
  selectedCategories: string[];
  onCategoryToggle: (category: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClearFilters: () => void;
  resultCount: number;
  isOpen: boolean; // For mobile drawer
  onClose: () => void;
  products?: BrowseProduct[]; // For computing category counts
  title?: string;
}

export function FilterPanel({
  categories,
  selectedCategories,
  onCategoryToggle,
  searchQuery,
  onSearchChange,
  onClearFilters,
  resultCount,
  isOpen,
  onClose,
  products = [],
  title = 'Filter',
}: FilterPanelProps) {
  // Compute category counts from products
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    categories.forEach((cat) => {
      counts[cat] = 0;
    });
    products.forEach((product) => {
      const code = product.typeCodeRel || product.typeCode;
      if (code && counts[code] !== undefined) {
        counts[code]++;
      }
    });
    return counts;
  }, [categories, products]);

  const hasActiveFilters = selectedCategories.length > 0 || searchQuery.length > 0;

  const handleClear = useCallback(() => {
    onClearFilters();
  }, [onClearFilters]);

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Filter Panel */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 lg:top-4 left-0 z-50 lg:z-auto',
          'h-full lg:h-[calc(100vh-2rem)]',
          'w-[280px] lg:w-[250px]',
          'bg-white border-r lg:border lg:rounded-xl border-gray-200',
          'flex flex-col',
          'transition-transform duration-300 ease-out',
          'lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-gray-500" />
            <h2 className="font-semibold text-gray-900">{title}</h2>
          </div>
          <div className="flex items-center gap-1">
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="h-8 px-2 text-xs text-gray-500 hover:text-gray-700"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Nullstill
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* Search Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Søk
            </h3>
            <ModelSearch
              value={searchQuery}
              onChange={onSearchChange}
              placeholder="Søk modell..."
              debounceMs={300}
            />
          </div>

          {/* Categories Section */}
          {categories.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Glass-type
              </h3>
              <CategoryFilterWithCounts
                categories={categories}
                selectedCategories={selectedCategories}
                onToggle={onCategoryToggle}
                counts={categoryCounts}
              />
            </div>
          )}
        </div>

        {/* Footer with Result Count */}
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 lg:rounded-b-xl">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {resultCount} resultat{resultCount !== 1 ? 'er' : ''}
            </span>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                className="h-8 text-xs border-gray-300 text-gray-600 hover:bg-gray-100"
              >
                Nullstill filter
              </Button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

// Mobile Filter Toggle Button
interface MobileFilterToggleProps {
  onClick: () => void;
  activeFilterCount?: number;
}

export function MobileFilterToggle({
  onClick,
  activeFilterCount = 0,
}: MobileFilterToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'lg:hidden flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
        activeFilterCount > 0 && 'border-autoglass-blue text-autoglass-blue'
      )}
    >
      <SlidersHorizontal className="h-4 w-4" />
      <span>Filter</span>
      {activeFilterCount > 0 && (
        <span className="flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-semibold bg-autoglass-blue text-white rounded-full">
          {activeFilterCount}
        </span>
      )}
    </button>
  );
}

// Re-export other components for convenience
export { ModelSearch } from './ModelSearch';
export { CategoryFilter, CategoryFilterWithCounts } from './CategoryFilter';

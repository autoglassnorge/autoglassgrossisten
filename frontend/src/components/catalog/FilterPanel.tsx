import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { CatalogFilters } from '@/types/api';
import { categoryLabel } from '@/utils/formatters';

interface FilterPanelProps {
  filters: CatalogFilters;
  availableFilters: {
    brands: string[];
    categories: string[];
    years: { min: number; max: number };
    prices: { min: number; max: number };
  };
  onChange: (filters: CatalogFilters) => void;
}

export function FilterPanel({ filters, availableFilters, onChange }: FilterPanelProps) {
  const update = (patch: Partial<CatalogFilters>) => {
    onChange({ ...filters, ...patch });
  };

  const hasActiveFilters =
    filters.brand?.length ||
    filters.category?.length ||
    filters.yearFrom ||
    filters.yearTo ||
    filters.priceMin ||
    filters.priceMax;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Filter
        </h3>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => onChange({})}>
            <X className="h-4 w-4 mr-1" />
            Nullstill
          </Button>
        )}
      </div>

      {/* Category */}
      <div>
        <h4 className="text-sm font-medium mb-2">Glass-type</h4>
        <div className="space-y-1">
          {availableFilters.categories.map((cat) => (
            <label key={cat} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={filters.category?.includes(cat) ?? false}
                onChange={(e) => {
                  const current = filters.category ?? [];
                  update({
                    category: e.target.checked
                      ? [...current, cat]
                      : current.filter((c) => c !== cat),
                  });
                }}
                className="rounded border-gray-300"
              />
              {categoryLabel(cat)}
            </label>
          ))}
        </div>
      </div>

      {/* Brand */}
      <div>
        <h4 className="text-sm font-medium mb-2">Merke</h4>
        <div className="max-h-48 overflow-y-auto space-y-1 pr-2">
          {availableFilters.brands.map((brand) => (
            <label key={brand} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={filters.brand?.includes(brand) ?? false}
                onChange={(e) => {
                  const current = filters.brand ?? [];
                  update({
                    brand: e.target.checked
                      ? [...current, brand]
                      : current.filter((b) => b !== brand),
                  });
                }}
                className="rounded border-gray-300"
              />
              {brand}
            </label>
          ))}
        </div>
      </div>

      {/* Year */}
      <div>
        <h4 className="text-sm font-medium mb-2">Årsmodell</h4>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Fra"
            value={filters.yearFrom ?? ''}
            onChange={(e) => update({ yearFrom: e.target.value ? Number(e.target.value) : undefined })}
            className="w-20 h-8 rounded-md border px-2 text-sm"
          />
          <span className="text-gray-400">—</span>
          <input
            type="number"
            placeholder="Til"
            value={filters.yearTo ?? ''}
            onChange={(e) => update({ yearTo: e.target.value ? Number(e.target.value) : undefined })}
            className="w-20 h-8 rounded-md border px-2 text-sm"
          />
        </div>
      </div>
    </div>
  );
}

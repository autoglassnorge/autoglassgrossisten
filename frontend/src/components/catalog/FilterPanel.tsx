import { useState } from 'react';
import { SlidersHorizontal, X, ChevronDown, ChevronUp } from 'lucide-react';
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

const EQUIPMENT_OPTIONS = [
  { key: 'adas', label: 'ADAS-kompatibel' },
  { key: 'heated', label: 'Oppvarmet' },
  { key: 'rainSensor', label: 'Regnsensor' },
  { key: 'acoustic', label: 'Akustisk' },
  { key: 'hud', label: 'HUD' },
  { key: 'camera', label: 'Kamera' },
];

function AccordionSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 pb-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-2 text-sm font-medium text-gray-900"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
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
    filters.priceMin !== undefined ||
    filters.priceMax !== undefined ||
    filters.equipment?.length ||
    filters.inStock;

  const priceMin = filters.priceMin ?? availableFilters.prices.min;
  const priceMax = filters.priceMax ?? availableFilters.prices.max;

  return (
    <div className="space-y-4">
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
      <AccordionSection title="Glass-type" defaultOpen>
        <div className="space-y-1.5">
          {availableFilters.categories.map((cat) => (
            <label key={cat} className="flex items-center gap-2.5 text-sm cursor-pointer">
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
                className="rounded border-gray-300 h-4 w-4 text-autoglass-blue focus:ring-autoglass-blue"
              />
              {categoryLabel(cat)}
            </label>
          ))}
        </div>
      </AccordionSection>

      {/* Equipment */}
      <AccordionSection title="Utstyr" defaultOpen>
        <div className="space-y-1.5">
          {EQUIPMENT_OPTIONS.map((opt) => (
            <label key={opt.key} className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={filters.equipment?.includes(opt.key) ?? false}
                onChange={(e) => {
                  const current = filters.equipment ?? [];
                  update({
                    equipment: e.target.checked
                      ? [...current, opt.key]
                      : current.filter((k) => k !== opt.key),
                  });
                }}
                className="rounded border-gray-300 h-4 w-4 text-autoglass-blue focus:ring-autoglass-blue"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </AccordionSection>

      {/* Brand */}
      <AccordionSection title="Merke" defaultOpen>
        <div className="max-h-48 overflow-y-auto space-y-1 pr-2">
          {availableFilters.brands.map((brand) => (
            <label key={brand} className="flex items-center gap-2.5 text-sm cursor-pointer">
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
                className="rounded border-gray-300 h-4 w-4 text-autoglass-blue focus:ring-autoglass-blue"
              />
              {brand}
            </label>
          ))}
        </div>
      </AccordionSection>

      {/* Year */}
      <AccordionSection title="Årsmodell" defaultOpen>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Fra"
            value={filters.yearFrom ?? ''}
            onChange={(e) => update({ yearFrom: e.target.value ? Number(e.target.value) : undefined })}
            className="w-20 h-9 rounded-md border border-gray-300 px-2 text-sm focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue"
          />
          <span className="text-gray-400">—</span>
          <input
            type="number"
            placeholder="Til"
            value={filters.yearTo ?? ''}
            onChange={(e) => update({ yearTo: e.target.value ? Number(e.target.value) : undefined })}
            className="w-20 h-9 rounded-md border border-gray-300 px-2 text-sm focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue"
          />
        </div>
      </AccordionSection>

      {/* Price Range */}
      <AccordionSection title="Pris" defaultOpen>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>{priceMin.toLocaleString('no-NO')} kr</span>
            <span>{priceMax.toLocaleString('no-NO')} kr</span>
          </div>
          <input
            type="range"
            min={availableFilters.prices.min}
            max={availableFilters.prices.max}
            value={priceMax}
            onChange={(e) => update({ priceMax: Number(e.target.value) })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-autoglass-blue"
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Min"
              value={filters.priceMin ?? ''}
              onChange={(e) => update({ priceMin: e.target.value ? Number(e.target.value) : undefined })}
              className="w-full h-9 rounded-md border border-gray-300 px-2 text-sm focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue"
            />
            <span className="text-gray-400">—</span>
            <input
              type="number"
              placeholder="Maks"
              value={filters.priceMax ?? ''}
              onChange={(e) => update({ priceMax: e.target.value ? Number(e.target.value) : undefined })}
              className="w-full h-9 rounded-md border border-gray-300 px-2 text-sm focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue"
            />
          </div>
        </div>
      </AccordionSection>

      {/* Stock Status */}
      <AccordionSection title="Lagerstatus" defaultOpen>
        <label className="flex items-center gap-2.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={filters.inStock ?? false}
            onChange={(e) => update({ inStock: e.target.checked || undefined })}
            className="rounded border-gray-300 h-4 w-4 text-autoglass-blue focus:ring-autoglass-blue"
          />
          <span>Kun på lager</span>
        </label>
      </AccordionSection>
    </div>
  );
}

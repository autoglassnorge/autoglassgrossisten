/**
 * Multi-select equipment filter panel for search results.
 */

import { SlidersHorizontal, X } from 'lucide-react';
import type { Product } from '@/types/api';
import {
  EQUIPMENT_FILTER_OPTIONS,
  productMatchesEquipmentFilters,
} from '@/utils/equipment-filters';

interface EquipmentFilterPanelProps {
  products: Product[];
  selectedKeys: string[];
  onChange: (selectedKeys: string[]) => void;
}

export function EquipmentFilterPanel({
  products,
  selectedKeys,
  onChange,
}: EquipmentFilterPanelProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Filtrer på utstyr</h3>
        </div>
        {selectedKeys.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 underline"
          >
            <X className="h-3 w-3" />
            Nullstill
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {EQUIPMENT_FILTER_OPTIONS.map((opt) => {
          const checked = selectedKeys.includes(opt.key);
          const count = products.filter((p) =>
            productMatchesEquipmentFilters(p, [opt.key])
          ).length;
          const disabled = count === 0 && !checked;

          return (
            <label
              key={opt.key}
              className={`
                inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer transition
                ${
                  checked
                    ? 'bg-autoglass-blue text-white border-autoglass-blue'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              title={disabled ? 'Ingen produkter har denne egenskapen blant treffene' : undefined}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                disabled={disabled}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange([...selectedKeys, opt.key]);
                  } else {
                    onChange(selectedKeys.filter((k) => k !== opt.key));
                  }
                }}
              />
              {opt.label}
              <span className={checked ? 'text-white/80' : 'text-gray-400'}>({count})</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

import { DoorOpen, PanelTop, PanelBottom, CircleDot, Square, LayoutGrid } from 'lucide-react';
import type { Product } from '@/types/api';

interface GlassCategoryFilterProps {
  products: Product[];
  activeCategory: string | null;
  onSelect: (category: string | null) => void;
}

// Category display order + icons
const CATEGORY_CONFIG: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: 'frontrute', label: 'Frontruter', icon: <PanelTop className="h-4 w-4" /> },
  { key: 'bakrute', label: 'Bakruter', icon: <PanelBottom className="h-4 w-4" /> },
  { key: 'dørrute-frem', label: 'Dørruter frem', icon: <DoorOpen className="h-4 w-4" /> },
  { key: 'dørrute-bak', label: 'Dørruter bak', icon: <DoorOpen className="h-4 w-4" /> },
  { key: 'siderute', label: 'Sideruter', icon: <Square className="h-4 w-4" /> },
  { key: 'ventilrute', label: 'Ventilruter', icon: <CircleDot className="h-4 w-4" /> },
  { key: 'annet', label: 'Annet glass', icon: <LayoutGrid className="h-4 w-4" /> },
];

export function GlassCategoryFilter({ products, activeCategory, onSelect }: GlassCategoryFilterProps) {
  // Count products per category
  const counts = new Map<string, number>();
  for (const p of products) {
    const cat = p.category?.toLowerCase() || 'annet';
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }

  // Only show categories that exist in products
  const visibleCategories = CATEGORY_CONFIG.filter(c => (counts.get(c.key) || 0) > 0);
  if (visibleCategories.length <= 1) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">Velg glass-type</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onSelect(null)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            activeCategory === null
              ? 'bg-autoglass-blue text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Alle
          <span className="text-xs opacity-80">({products.length})</span>
        </button>
        {visibleCategories.map((cat) => {
          const count = counts.get(cat.key) || 0;
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => onSelect(isActive ? null : cat.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-autoglass-blue text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cat.icon}
              {cat.label}
              <span className="text-xs opacity-80">({count})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

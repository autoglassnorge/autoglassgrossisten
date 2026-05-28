import { useMemo } from 'react';

interface BrandInfo {
  name: string;
  productCount: number;
}

interface BrandGridProps {
  brands: BrandInfo[];
  selectedBrand: string;
  onSelect: (brand: string) => void;
}

// Deterministic color palette for brands (20 colors, cycling)
const BRAND_COLORS = [
  { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', accent: 'bg-red-500' },
  { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', accent: 'bg-orange-500' },
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', accent: 'bg-amber-500' },
  { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', accent: 'bg-yellow-500' },
  { bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700', accent: 'bg-lime-500' },
  { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', accent: 'bg-green-500' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', accent: 'bg-emerald-500' },
  { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', accent: 'bg-teal-500' },
  { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', accent: 'bg-cyan-500' },
  { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', accent: 'bg-sky-500' },
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', accent: 'bg-blue-500' },
  { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', accent: 'bg-indigo-500' },
  { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', accent: 'bg-violet-500' },
  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', accent: 'bg-purple-500' },
  { bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', accent: 'bg-fuchsia-500' },
  { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', accent: 'bg-pink-500' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', accent: 'bg-rose-500' },
  { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', accent: 'bg-slate-500' },
  { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', accent: 'bg-gray-500' },
  { bg: 'bg-zinc-50', border: 'border-zinc-200', text: 'text-zinc-700', accent: 'bg-zinc-500' },
];

function getBrandColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % BRAND_COLORS.length;
  return BRAND_COLORS[idx];
}

function getBrandInitials(name: string): string {
  return name
    .split(/[\s\-./]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function BrandGrid({ brands, selectedBrand, onSelect }: BrandGridProps) {
  const sorted = useMemo(() => {
    return [...brands].sort((a, b) => a.name.localeCompare(b.name));
  }, [brands]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {sorted.map((brand) => {
        const color = getBrandColor(brand.name);
        const isSelected = selectedBrand === brand.name;

        return (
          <button
            key={brand.name}
            type="button"
            onClick={() => onSelect(isSelected ? '' : brand.name)}
            className={`
              group relative flex flex-col items-center justify-center
              rounded-xl border-2 p-4 min-h-[100px] sm:min-h-[120px]
              transition-all duration-200
              ${isSelected
                ? `${color.bg} ${color.border} ring-2 ring-offset-2 ring-autoglass-blue shadow-md`
                : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
              }
            `}
          >
            {/* Initial badge */}
            <div
              className={`
                flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center
                rounded-full text-lg sm:text-xl font-bold
                transition-transform group-hover:scale-105
                ${isSelected ? color.accent + ' text-white' : color.bg + ' ' + color.text}
              `}
            >
              {getBrandInitials(brand.name)}
            </div>

            {/* Brand name */}
            <span className="mt-2 text-sm font-semibold text-gray-900 text-center leading-tight line-clamp-1">
              {brand.name}
            </span>

            {/* Product count */}
            <span className="mt-0.5 text-xs text-gray-500">
              {brand.productCount.toLocaleString('no-NO')} produkt{brand.productCount !== 1 ? 'er' : ''}
            </span>

            {/* Selected checkmark */}
            {isSelected && (
              <div className="absolute top-2 right-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-autoglass-blue text-white text-xs font-bold">
                  ✓
                </div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

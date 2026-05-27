import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { Product } from '@/types/api';
import { typeCodeShort, typeCodeIcon } from '@/utils/formatters';

interface TypeCodeTabsProps {
  products: Product[];
  activeType: string | null;
  onSelect: (type: string | null) => void;
}

export function TypeCodeTabs({ products, activeType, onSelect }: TypeCodeTabsProps) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => {
      map.set(p.typeCode, (map.get(p.typeCode) ?? 0) + 1);
    });
    return map;
  }, [products]);

  const types = useMemo(() => {
    // Maintain stable order: F, B, DFF, DFB, DPF, DPB, SFB1, SPB1, DFBV, DPBV, DFFV, DPFV, SFB2, SPB2, SFB3, SPB3
    const order = ['F','B','DFF','DFB','DPF','DPB','SFB1','SPB1','DFBV','DPBV','DFFV','DPFV','SFB2','SPB2','SFB3','SPB3'];
    const present = Array.from(counts.keys());
    return order.filter((t) => present.includes(t));
  }, [counts]);

  if (types.length === 0) return null;

  return (
    <div className="w-full">
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
        {/* All tab */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            'flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors min-h-[44px]',
            activeType === null
              ? 'bg-autoglass-blue text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          )}
        >
          <span>🪟</span>
          <span className="hidden sm:inline">Alle</span>
          <span className="sm:hidden">Alle</span>
          <span className={cn(
            'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
            activeType === null ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
          )}>
            {products.length}
          </span>
        </button>

        {types.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => onSelect(code)}
            className={cn(
              'flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors min-h-[44px]',
              activeType === code
                ? 'bg-autoglass-blue text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            <span className="text-base leading-none">{typeCodeIcon(code)}</span>
            <span className="hidden sm:inline">{typeCodeShort(code)}</span>
            <span className="sm:hidden text-xs">{code}</span>
            <span className={cn(
              'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
              activeType === code ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
            )}>
              {counts.get(code)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { Product } from '@/types/api';
import { Wind, Square, DoorOpen, PanelTop, Layers, HelpCircle } from 'lucide-react';
import { GLASS_TYPE_GROUPS, countByGroup, countByTypeCode } from '@/utils/glass-categories';
import { typeCodeShort } from '@/utils/formatters';

interface GlassTypeSelectorProps {
  products: Product[];
  activeType: string | null;
  onSelect: (type: string | null) => void;
}

const groupIcons: Record<string, React.ReactNode> = {
  Frontrute: <Wind className="h-4 w-4" />,
  Bakrute: <Square className="h-4 w-4" />,
  'Dørrute': <DoorOpen className="h-4 w-4" />,
  Siderute: <PanelTop className="h-4 w-4" />,
};

export function GlassTypeSelector({ products, activeType, onSelect }: GlassTypeSelectorProps) {
  const counts = useMemo(() => countByGroup(products), [products]);

  const visibleGroups = useMemo(
    () => GLASS_TYPE_GROUPS.filter((g) => (counts.get(g.key) ?? 0) > 0),
    [counts]
  );

  const hasOther = (counts.get('Annet') ?? 0) > 0;
  const totalCount = products.length;

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2">
        {/* All tab */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[44px] border',
            activeType === null
              ? 'bg-autoglass-blue text-white border-autoglass-blue'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          )}
        >
          <Layers className="h-4 w-4" />
          <span>Alle</span>
          <span
            className={cn(
              'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
              activeType === null ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
            )}
          >
            {totalCount}
          </span>
        </button>

        {/* Category groups */}
        {visibleGroups.map((group) => {
          const count = counts.get(group.key) ?? 0;
          const isActive = activeType === group.key;
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => onSelect(group.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[44px] border',
                isActive
                  ? 'bg-autoglass-blue text-white border-autoglass-blue'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              )}
            >
              {groupIcons[group.key]}
              <span className="hidden sm:inline">{group.label}</span>
              <span className="sm:hidden">{group.shortLabel}</span>
              <span
                className={cn(
                  'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                )}
              >
                {count}
              </span>
            </button>
          );
        })}

        {/* Other / unknown types */}
        {hasOther && (
          <button
            type="button"
            onClick={() => onSelect('Annet')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[44px] border',
              activeType === 'Annet'
                ? 'bg-autoglass-blue text-white border-autoglass-blue'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            )}
          >
            <HelpCircle className="h-4 w-4" />
            <span>Annet</span>
            <span
              className={cn(
                'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                activeType === 'Annet' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
              )}
            >
              {counts.get('Annet')}
            </span>
          </button>
        )}
      </div>

      {/* Sub-type pills when a group is selected */}
      {activeType && activeType !== 'Annet' && activeType !== null && (
        <GroupSubPills groupKey={activeType} products={products} onSelect={onSelect} />
      )}
    </div>
  );
}

// Sub-pills for individual type codes within a group
function GroupSubPills({
  groupKey,
  products,
  onSelect,
}: {
  groupKey: string;
  products: Product[];
  onSelect: (code: string) => void;
}) {
  const group = GLASS_TYPE_GROUPS.find((g) => g.key === groupKey);
  if (!group) return null;

  const codeCounts = useMemo(() => countByTypeCode(products), [products]);

  const presentCodes = group.codes.filter((c) => (codeCounts.get(c) ?? 0) > 0);
  if (presentCodes.length <= 1) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5 pl-1">
      {presentCodes.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onSelect(code)}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
        >
          {typeCodeShort(code)}
          <span className="text-xs text-gray-500">{codeCounts.get(code)}</span>
        </button>
      ))}
    </div>
  );
}

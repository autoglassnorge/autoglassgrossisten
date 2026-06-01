import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CategoryCount {
  code: string;
  label: string;
  count: number;
}

interface CategoryFilterProps {
  categories: string[]; // Category codes like ['F', 'B', 'DFF', ...]
  selectedCategories: string[];
  onToggle: (category: string) => void;
}

const typeCodeLabel = (tc: string | null): string => {
  if (!tc) return 'Ukjent';
  const map: Record<string, string> = {
    'F': 'Frontrute',
    'B': 'Bakrute',
    'DFF': 'Dørrute fremre førerside',
    'DPF': 'Dørrute fremre passasjerside',
    'DFB': 'Dørrute bakre førerside',
    'DPB': 'Dørrute bakre passasjerside',
    'SFB1': 'Siderute bakre 1 førerside',
    'SPB1': 'Siderute bakre 1 passasjerside',
    'SFB2': 'Siderute bakre 2 førerside',
    'SPB2': 'Siderute 2 bakre passasjerside',
    'DFFV': 'Ventil/siderute fremre førerside',
    'DPFV': 'Ventil/siderute fremre passasjerside',
    'DFBV': 'Ventil/siderute bakre førerside',
    'DPBV': 'Ventil/siderute bakre passasjerside',
  };
  return map[tc] || tc;
};

export function CategoryFilter({
  categories,
  selectedCategories,
  onToggle,
}: CategoryFilterProps) {
  // Build category counts from codes
  const categoryCounts: CategoryCount[] = categories.map((code): CategoryCount => ({
    code,
    label: typeCodeLabel(code),
    count: 0, // Will be passed from parent with counts
  }));

  return (
    <div className="space-y-2">
      {categoryCounts.map(({ code, label }) => {
        const isSelected = selectedCategories.includes(code);
        return (
          <button
            key={code}
            type="button"
            onClick={() => onToggle(code)}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all',
              'border hover:shadow-sm',
              isSelected
                ? 'bg-autoglass-blue/10 border-autoglass-blue text-autoglass-blue'
                : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'flex items-center justify-center w-4 h-4 rounded border transition-colors',
                  isSelected
                    ? 'bg-autoglass-blue border-autoglass-blue'
                    : 'border-gray-300 bg-white'
                )}
              >
                {isSelected && <Check className="h-3 w-3 text-white" />}
              </span>
              <span className="font-medium">{label}</span>
            </span>
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full',
                isSelected
                  ? 'bg-autoglass-blue/20 text-autoglass-blue'
                  : 'bg-gray-100 text-gray-500'
              )}
            >
              {code}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Extended version with product counts
interface CategoryFilterWithCountsProps extends CategoryFilterProps {
  counts: Record<string, number>;
}

export function CategoryFilterWithCounts({
  categories,
  selectedCategories,
  onToggle,
  counts,
}: CategoryFilterWithCountsProps) {
  const categoryCounts: CategoryCount[] = categories.map((code): CategoryCount => ({
    code,
    label: typeCodeLabel(code),
    count: counts[code] || 0,
  }));

  // Sort by count descending
  const sortedCategories = [...categoryCounts].sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-2">
      {sortedCategories.map(({ code, label, count }) => {
        const isSelected = selectedCategories.includes(code);
        return (
          <button
            key={code}
            type="button"
            onClick={() => onToggle(code)}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all',
              'border hover:shadow-sm',
              isSelected
                ? 'bg-autoglass-blue/10 border-autoglass-blue text-autoglass-blue'
                : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'flex items-center justify-center w-4 h-4 rounded border transition-colors',
                  isSelected
                    ? 'bg-autoglass-blue border-autoglass-blue'
                    : 'border-gray-300 bg-white'
                )}
              >
                {isSelected && <Check className="h-3 w-3 text-white" />}
              </span>
              <span className="font-medium">{label}</span>
            </span>
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full min-w-[1.5rem] text-center',
                isSelected
                  ? 'bg-autoglass-blue/20 text-autoglass-blue'
                  : 'bg-gray-100 text-gray-500'
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

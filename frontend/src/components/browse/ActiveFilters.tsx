import { X, Tag, Home, Car, Calendar, Layers } from 'lucide-react';

interface Filter {
  type: 'brand' | 'model' | 'year' | 'category';
  label: string;
  value: string;
}

interface ActiveFiltersProps {
  filters: Filter[];
  onRemoveFilter: (type: string) => void;
  onClearAll: () => void;
}

const filterIcons = {
  brand: Home,
  model: Car,
  year: Calendar,
  category: Layers,
};

const filterLabels = {
  brand: 'Merke',
  model: 'Modell',
  year: 'År',
  category: 'Kategori',
};

export default function ActiveFilters({
  filters,
  onRemoveFilter,
  onClearAll,
}: ActiveFiltersProps) {
  if (filters.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-50 border-b border-gray-200 py-3">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Label */}
          <div className="flex items-center gap-2 text-sm text-gray-500 flex-shrink-0">
            <Tag className="w-4 h-4" />
            <span className="font-medium">Aktive filter:</span>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-2 flex-1">
            {filters.map((filter) => {
              const Icon = filterIcons[filter.type];
              return (
                <button
                  key={filter.type}
                  onClick={() => onRemoveFilter(filter.type)}
                  className="
                    inline-flex items-center gap-1.5
                    bg-white border border-gray-200
                    hover:bg-red-50 hover:border-red-200 hover:text-red-700
                    text-gray-700
                    rounded-full
                    px-3 py-1.5
                    text-sm
                    transition-colors
                    group
                    focus:outline-none focus:ring-2 focus:ring-autoglass-blue focus:ring-offset-1
                  "
                  title={`Fjern ${filterLabels[filter.type]}`}
                >
                  <Icon className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-500" />
                  <span className="font-medium">{filter.value}</span>
                  <span className="sr-only">
                    Fjern {filterLabels[filter.type]}
                  </span>
                  <X className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-500 ml-0.5" />
                </button>
              );
            })}
          </div>

          {/* Clear all button */}
          <button
            onClick={onClearAll}
            className="
              text-sm text-gray-500 hover:text-red-600
              underline underline-offset-2
              transition-colors
              flex-shrink-0
              whitespace-nowrap
              self-start sm:self-auto
            "
          >
            Nullstill alle
          </button>
        </div>

        {/* Mobile summary */}
        <div className="sm:hidden mt-2 text-xs text-gray-400">
          {filters.length} {filters.length === 1 ? 'filter' : 'filter'} aktive
        </div>
      </div>
    </div>
  );
}

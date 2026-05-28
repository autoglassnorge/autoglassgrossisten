import { ChevronLeft } from 'lucide-react';

interface YearTimelineProps {
  brand: string;
  model: string;
  years: string[];
  selectedYear: string;
  onSelect: (year: string) => void;
  onBack: () => void;
}

export function YearTimeline({ brand, model, years, selectedYear, onSelect, onBack }: YearTimelineProps) {
  // Sort years descending (newest first)
  const sortedYears = [...years].sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors min-h-[44px] px-2 -ml-2 rounded-md hover:bg-gray-100"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Modeller</span>
        </button>
        <div className="h-4 w-px bg-gray-300" />
        <div>
          <h2 className="text-lg font-bold text-gray-900 leading-tight">{brand} {model}</h2>
          <span className="text-sm text-gray-500">
            {sortedYears.length} årsmodell{sortedYears.length !== 1 ? 'er' : ''}
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative py-4">
        {/* Horizontal line (desktop only) */}
        <div className="hidden sm:block absolute top-1/2 left-0 right-0 h-0.5 bg-gray-200 -translate-y-1/2" />

        <div className="flex flex-wrap sm:flex-nowrap gap-2 sm:gap-0 sm:justify-between">
          {sortedYears.map((year) => {
            const isSelected = selectedYear === year;

            return (
              <button
                key={year}
                type="button"
                onClick={() => onSelect(isSelected ? '' : year)}
                className="group relative flex flex-col items-center transition-all duration-200 sm:flex-1 sm:min-w-0"
              >
                {/* Year badge */}
                <div
                  className={`
                    relative z-10 flex items-center justify-center
                    rounded-full border-2 text-sm font-bold
                    transition-all duration-200
                    min-h-[44px] min-w-[44px] px-3 sm:px-0 sm:w-12 sm:h-12
                    ${isSelected
                      ? 'border-autoglass-blue bg-autoglass-blue text-white shadow-md scale-110'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                    }
                  `}
                >
                  {year.slice(0, 4)}
                </div>

                {/* Connector glow for selected */}
                {isSelected && (
                  <div className="hidden sm:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-autoglass-blue/10 -z-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

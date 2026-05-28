import { Car, ChevronLeft } from 'lucide-react';

interface ModelInfo {
  name: string;
  productCount: number;
  yearRange: string;
}

interface ModelCardsProps {
  brand: string;
  models: ModelInfo[];
  selectedModel: string;
  onSelect: (model: string) => void;
  onBack: () => void;
}

export function ModelCards({ brand, models, selectedModel, onSelect, onBack }: ModelCardsProps) {
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
          <span>Alle merker</span>
        </button>
        <div className="h-4 w-px bg-gray-300" />
        <h2 className="text-lg font-bold text-gray-900">{brand}</h2>
        <span className="text-sm text-gray-500">
          {models.length} modell{models.length !== 1 ? 'er' : ''}
        </span>
      </div>

      {/* Model grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {models.map((model) => {
          const isSelected = selectedModel === model.name;

          return (
            <button
              key={model.name}
              type="button"
              onClick={() => onSelect(isSelected ? '' : model.name)}
              className={`
                group flex items-center gap-3 rounded-xl border-2 p-3 text-left
                transition-all duration-200 min-h-[64px]
                ${isSelected
                  ? 'border-autoglass-blue bg-autoglass-blue/5 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                }
              `}
            >
              <div
                className={`
                  flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg
                  ${isSelected ? 'bg-autoglass-blue text-white' : 'bg-gray-100 text-gray-500'}
                  transition-colors
                `}
              >
                <Car className="h-5 w-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 text-sm truncate">
                  {model.name}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                  <span>{model.productCount} produkt{model.productCount !== 1 ? 'er' : ''}</span>
                  {model.yearRange && (
                    <>
                      <span>·</span>
                      <span>{model.yearRange}</span>
                    </>
                  )}
                </div>
              </div>

              {isSelected && (
                <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-autoglass-blue text-white text-xs font-bold">
                  ✓
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

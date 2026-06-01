import { useState, useMemo } from 'react';
import { AlertCircle, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WizardStepContainer } from '../WizardStep';
import type { WizardStep as StepType } from '../hooks/useWizardState';

interface YearStepProps {
  currentStep: StepType;
  selectedBrand: string;
  selectedModel: string;
  years: string[];
  isLoading: boolean;
  error: string | null;
  onSelectYear: (year: string) => void;
  onBack: () => void;
}

export function YearStep({
  currentStep,
  selectedBrand,
  selectedModel,
  years,
  isLoading,
  error,
  onSelectYear,
  onBack,
}: YearStepProps) {
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  // Parse year ranges and sort them
  const parsedYears = useMemo(() => {
    return years
      .map((yearStr) => {
        // Handle formats like "2018-2022" or "2018"
        const parts = yearStr.split('-');
        const startYear = parseInt(parts[0], 10);
        const endYear = parts[1] ? parseInt(parts[1], 10) : startYear;
        return {
          raw: yearStr,
          startYear,
          endYear,
          // Try to extract generation code (e.g., "2018-2022 (G20)")
          generation: yearStr.match(/\(([^)]+)\)/)?.[1],
        };
      })
      .sort((a, b) => b.startYear - a.startYear); // Newest first
  }, [years]);

  const handleContinue = () => {
    if (selectedYear) {
      onSelectYear(selectedYear);
    }
  };

  return (
    <WizardStepContainer
      step="year"
      currentStep={currentStep}
      title="Velg årsmodell"
      subtitle={`${selectedBrand} ${selectedModel}`}
      canGoBack={true}
      canProceed={!!selectedYear}
      onBack={onBack}
      onNext={handleContinue}
      nextLabel="Vis produkter"
    >
      <div className="space-y-4">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-glass-cyan border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-800 rounded-md text-sm text-red-400">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Year selection cards */}
        {!isLoading && !error && (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {parsedYears.map((year) => (
              <button
                key={year.raw}
                type="button"
                onClick={() => setSelectedYear(year.raw)}
                className={cn(
                  'w-full p-4 text-left rounded-lg border transition-all flex items-center justify-between',
                  selectedYear === year.raw
                    ? 'bg-glass-cyan/10 border-glass-cyan text-glass-cyan'
                    : 'bg-carbon-900 border-carbon-700 text-carbon-300 hover:border-carbon-600'
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center',
                      selectedYear === year.raw
                        ? 'bg-glass-cyan/20 text-glass-cyan'
                        : 'bg-carbon-800 text-carbon-500'
                    )}
                  >
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-medium">
                      {year.startYear === year.endYear
                        ? year.startYear
                        : `${year.startYear}–${year.endYear}`}
                    </span>
                    {year.generation && (
                      <span className="ml-2 text-xs text-carbon-500">
                        ({year.generation})
                      </span>
                    )}
                  </div>
                </div>
                {selectedYear === year.raw && (
                  <span className="text-glass-cyan text-lg">✓</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && parsedYears.length === 0 && (
          <div className="text-center py-8">
            <p className="text-carbon-500 mb-2">
              Ingen årsmodeller funnet for {selectedBrand} {selectedModel}
            </p>
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-glass-cyan hover:underline"
            >
              Gå tilbake og velg annen modell
            </button>
          </div>
        )}
      </div>
    </WizardStepContainer>
  );
}

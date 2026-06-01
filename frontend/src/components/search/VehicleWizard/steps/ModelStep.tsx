import { useState, useMemo } from 'react';
import { Search, AlertCircle, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WizardStepContainer } from '../WizardStep';
import type { WizardStep as StepType } from '../hooks/useWizardState';

interface ModelStepProps {
  currentStep: StepType;
  selectedBrand: string;
  models: string[];
  isLoading: boolean;
  error: string | null;
  onSelectModel: (model: string) => void;
  onBack: () => void;
}

export function ModelStep({
  currentStep,
  selectedBrand,
  models,
  isLoading,
  error,
  onSelectModel,
  onBack,
}: ModelStepProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const filteredModels = useMemo(() => {
    if (!searchTerm) return models;
    const term = searchTerm.toLowerCase();
    return models.filter(m => m.toLowerCase().includes(term));
  }, [models, searchTerm]);

  // Group models by series (e.g., "3-serie", "5-serie")
  const groupedModels = useMemo(() => {
    const groups: Record<string, string[]> = {};
    filteredModels.forEach((model) => {
      // Extract series prefix (e.g., "320d" -> "3-serie")
      const match = model.match(/^(\d+)/);
      const series = match ? `${match[1]}-serie` : 'Andre';
      if (!groups[series]) groups[series] = [];
      groups[series].push(model);
    });
    return groups;
  }, [filteredModels]);

  const handleContinue = () => {
    if (selectedModel) {
      onSelectModel(selectedModel);
    }
  };

  return (
    <WizardStepContainer
      step="model"
      currentStep={currentStep}
      title="Velg modell"
      subtitle={`For ${selectedBrand}`}
      canGoBack={true}
      canProceed={!!selectedModel}
      onBack={onBack}
      onNext={handleContinue}
      nextLabel="Fortsett"
    >
      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-carbon-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Søk etter modell..."
            className="w-full pl-9 pr-4 py-2 bg-carbon-900 border border-carbon-700 rounded-md text-white placeholder:text-carbon-600 text-sm outline-none focus:border-glass-cyan"
          />
        </div>

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

        {/* Model list by series */}
        {!isLoading && !error && (
          <div className="space-y-4 max-h-64 overflow-y-auto">
            {Object.entries(groupedModels).map(([series, seriesModels]) => (
              <div key={series}>
                <h4 className="text-xs font-medium text-carbon-500 uppercase tracking-wider mb-2">
                  {series}
                </h4>
                <div className="space-y-1">
                  {seriesModels.map((model) => (
                    <button
                      key={model}
                      type="button"
                      onClick={() => setSelectedModel(model)}
                      className={cn(
                        'w-full p-2.5 text-left rounded-md border transition-all flex items-center justify-between',
                        selectedModel === model
                          ? 'bg-glass-cyan/10 border-glass-cyan text-glass-cyan'
                          : 'bg-carbon-900 border-carbon-700 text-carbon-300 hover:border-carbon-600'
                      )}
                    >
                      <span className="text-sm">{model}</span>
                      {selectedModel === model && (
                        <span className="text-glass-cyan">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && filteredModels.length === 0 && (
          <div className="text-center py-4">
            <p className="text-carbon-500 mb-2">
              {searchTerm ? 'Ingen treff for søket' : `Ingen modeller funnet for ${selectedBrand}`}
            </p>
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-glass-cyan hover:underline inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" />
              Velg annet merke
            </button>
          </div>
        )}
      </div>
    </WizardStepContainer>
  );
}

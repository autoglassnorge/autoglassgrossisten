import { useState, useMemo } from 'react';
import { Search, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WizardStepContainer } from '../WizardStep';
import type { WizardStep as StepType } from '../hooks/useWizardState';

interface BrandStepProps {
  currentStep: StepType;
  brands: string[];
  isLoading: boolean;
  error: string | null;
  onSelectBrand: (brand: string) => void;
  onBack: () => void;
}

export function BrandStep({
  currentStep,
  brands,
  isLoading,
  error,
  onSelectBrand,
  onBack,
}: BrandStepProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);

  const filteredBrands = useMemo(() => {
    if (!searchTerm) return brands;
    const term = searchTerm.toLowerCase();
    return brands.filter(b => b.toLowerCase().includes(term));
  }, [brands, searchTerm]);

  const handleContinue = () => {
    if (selectedBrand) {
      onSelectBrand(selectedBrand);
    }
  };

  return (
    <WizardStepContainer
      step="brand"
      currentStep={currentStep}
      title="Velg bilmerke"
      subtitle="Vi fant ikke eksakt match. Velg merke for å fortsette."
      canGoBack={true}
      canProceed={!!selectedBrand}
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
            placeholder="Søk etter merke..."
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

        {/* Brand grid */}
        {!isLoading && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
            {filteredBrands.map((brand) => (
              <button
                key={brand}
                type="button"
                onClick={() => setSelectedBrand(brand)}
                className={cn(
                  'p-3 text-left rounded-md border transition-all min-h-[48px]',
                  selectedBrand === brand
                    ? 'bg-glass-cyan/10 border-glass-cyan text-glass-cyan'
                    : 'bg-carbon-900 border-carbon-700 text-carbon-300 hover:border-carbon-600'
                )}
              >
                <span className="text-sm font-medium">{brand}</span>
                {selectedBrand === brand && (
                  <span className="ml-2 text-glass-cyan">✓</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && filteredBrands.length === 0 && (
          <p className="text-center text-carbon-500 py-4">
            {searchTerm ? 'Ingen treff for søket' : 'Ingen merker tilgjengelig'}
          </p>
        )}
      </div>
    </WizardStepContainer>
  );
}

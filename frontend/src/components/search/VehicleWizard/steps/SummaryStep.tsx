import { useState, useEffect } from 'react';
import { AlertCircle, RefreshCw, Check, Car } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WizardStepContainer } from '../WizardStep';
import type { WizardStep as StepType } from '../hooks/useWizardState';
import type { Product } from '@/types/api';

interface SummaryStepProps {
  currentStep: StepType;
  regnr: string;
  ktype?: string;
  selectedBrand?: string;
  selectedModel?: string;
  selectedYear?: string;
  onReset: () => void;
  onBack: () => void;
}

export function SummaryStep({
  currentStep,
  regnr,
  ktype,
  selectedBrand,
  selectedModel,
  selectedYear,
  onReset,
  onBack,
}: SummaryStepProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Format vehicle display string
  const vehicleDisplay = () => {
    if (ktype && selectedBrand && selectedModel) {
      return `${selectedBrand} ${selectedModel} ${selectedYear || ''}`.trim();
    }
    if (selectedBrand && selectedModel && selectedYear) {
      return `${selectedBrand} ${selectedModel} ${selectedYear}`;
    }
    return regnr;
  };

  // Determine if we have an exact kType match
  const isExactMatch = !!ktype;

  useEffect(() => {
    if (currentStep !== 'summary') return;

    const fetchProducts = async () => {
      setIsLoading(true);
      setError(null);

      try {
        let url: string;

        if (ktype) {
          // Exact kType match
          url = `/api/products/search?ktype=${encodeURIComponent(ktype)}`;
        } else if (selectedBrand && selectedModel && selectedYear) {
          // Manual selection fallback - use the existing glass endpoint
          const params = new URLSearchParams({
            brand: selectedBrand,
            model: selectedModel,
            year: selectedYear,
          });
          url = `/api/glass?${params}`;
        } else {
          setError('Mangler kjøretøyinformasjon');
          setIsLoading(false);
          return;
        }

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        // Handle both /api/products/search and /api/glass response formats
        setProducts(data.products || data.candidates || []);
      } catch (err) {
        setError('Kunne ikke hente produkter');
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, [currentStep, ktype, selectedBrand, selectedModel, selectedYear]);

  return (
    <WizardStepContainer
      step="summary"
      currentStep={currentStep}
      title="Bekreft kjøretøy"
      subtitle={isExactMatch ? 'Eksakt match funnet' : 'Manuelt valg'}
      canGoBack={true}
      canProceed={false}
      onBack={onBack}
    >
      <div className="space-y-6">
        {/* Vehicle confirmation card */}
        <div className="bg-carbon-900 border border-carbon-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center shrink-0',
                isExactMatch ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
              )}
            >
              {isExactMatch ? <Check className="w-6 h-6" /> : <Car className="w-6 h-6" />}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white truncate">{vehicleDisplay()}</h3>
              {regnr && (
                <p className="text-sm text-carbon-400 font-mono uppercase">
                  Reg.nr: {regnr}
                </p>
              )}
              {ktype && (
                <p className="text-xs text-carbon-500 mt-1">
                  kType: {ktype}
                </p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    isExactMatch
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-amber-500/20 text-amber-400'
                  )}
                >
                  {isExactMatch ? 'Eksakt match' : 'Manuelt valg'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onReset}
              className="text-sm text-glass-cyan hover:underline shrink-0"
            >
              Endre
            </button>
          </div>
        </div>

        {/* Products section */}
        <div>
          <h4 className="text-sm font-medium text-carbon-300 mb-3">
            Tilgjengelige produkter
          </h4>

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-glass-cyan border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Error */}
          {error && !isLoading && (
            <div className="flex items-center gap-2 p-4 bg-red-900/20 border border-red-800 rounded-md text-sm text-red-400">
              <AlertCircle className="w-5 h-5" />
              <div>
                <p className="font-medium">{error}</p>
                <button
                  type="button"
                  onClick={onBack}
                  className="text-glass-cyan hover:underline mt-1"
                >
                  Gå tilbake og prøv igjen
                </button>
              </div>
            </div>
          )}

          {/* Products list */}
          {!isLoading && !error && products.length > 0 && (
            <div className="space-y-3">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="bg-carbon-900 border border-carbon-700 rounded-lg p-4 hover:border-carbon-600 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {product.imageUrl && (
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-16 h-16 object-cover rounded bg-carbon-800"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h5 className="font-medium text-white truncate">
                        {product.title}
                      </h5>
                      <p className="text-sm text-carbon-400">
                        {product.brand} • {product.eurocode || product.articleNumber}
                      </p>
                      <div className="mt-2 flex items-center gap-4">
                        <span className="font-semibold text-glass-cyan">
                          {product.price.toLocaleString('no-NO')} kr
                        </span>
                        <span
                          className={cn(
                            'text-xs px-2 py-0.5 rounded-full',
                            product.stockStatus > 0
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          )}
                        >
                          {product.stockStatus > 0 ? 'På lager' : 'Bestillingsvare'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && products.length === 0 && (
            <div className="text-center py-8 bg-carbon-900/50 border border-carbon-800 rounded-lg">
              <p className="text-carbon-500 mb-2">Ingen produkter funnet</p>
              <p className="text-sm text-carbon-600">
                Prøv å endre årsmodell eller kontakt oss for hjelp
              </p>
              <button
                type="button"
                onClick={onBack}
                className="mt-4 text-glass-cyan hover:underline text-sm"
              >
                Gå tilbake
              </button>
            </div>
          )}
        </div>

        {/* Reset button */}
        <button
          type="button"
          onClick={onReset}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 text-carbon-400 hover:text-white border border-carbon-700 hover:border-carbon-600 rounded-md transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Nytt søk
        </button>
      </div>
    </WizardStepContainer>
  );
}

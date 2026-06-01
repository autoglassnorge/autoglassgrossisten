import { useState } from 'react';
import { Search, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WizardStepContainer } from '../WizardStep';
import type { WizardStep as StepType } from '../hooks/useWizardState';
import type { KtypeLookupResponse } from '@/types/api';

interface RegnrStepProps {
  currentStep: StepType;
  regnr: string;
  onRegnrChange: (regnr: string) => void;
  onKtypeFound: (ktype: string, vehicle: KtypeLookupResponse['vehicle']) => void;
  onManualSelect: () => void;
  lookupKtype: (regnr: string) => Promise<KtypeLookupResponse | null>;
  isLoading: boolean;
  error: string | null;
}

export function RegnrStep({
  currentStep,
  regnr,
  onRegnrChange,
  onKtypeFound,
  onManualSelect,
  lookupKtype,
  isLoading,
  error,
}: RegnrStepProps) {
  const [localError, setLocalError] = useState<string | null>(null);

  const validateRegnr = (value: string): boolean => {
    // Norwegian regnr format: 2 letters + 4-5 digits
    const clean = value.replace(/\s/g, '').toUpperCase();
    return /^[A-Z]{2}\d{4,5}$/.test(clean);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!validateRegnr(regnr)) {
      setLocalError('Ugyldig registreringsnummer. Format: AB12345');
      return;
    }

    const result = await lookupKtype(regnr);
    
    if (result?.success && result.ktype) {
      onKtypeFound(String(result.ktype), result.vehicle);
    } else {
      // kType not found, go to manual selection
      onManualSelect();
    }
  };

  const displayError = localError || error;

  return (
    <WizardStepContainer
      step="regnr"
      currentStep={currentStep}
      title="Finn bilglass til din bil"
      subtitle="Skriv inn registreringsnummeret for å finne riktig glass"
      canGoBack={false}
      canProceed={false}
      onBack={() => {}}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="regnr" className="block text-sm font-medium text-carbon-300 mb-2">
            Registreringsnummer
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-carbon-500" />
            </div>
            <input
              type="text"
              id="regnr"
              value={regnr}
              onChange={(e) => {
                onRegnrChange(e.target.value.toUpperCase());
                setLocalError(null);
              }}
              placeholder="AB 12345"
              disabled={isLoading}
              className={cn(
                'block w-full pl-10 pr-4 py-3 bg-carbon-900 border rounded-md text-white placeholder:text-carbon-600 font-mono tracking-wider uppercase outline-none transition-colors',
                displayError
                  ? 'border-red-500 focus:border-red-400'
                  : 'border-carbon-700 focus:border-glass-cyan'
              )}
              autoComplete="off"
              spellCheck={false}
            />
            {isLoading && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <div className="w-5 h-5 border-2 border-glass-cyan border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          {displayError && (
            <div className="mt-2 flex items-center gap-2 text-sm text-red-400">
              <AlertCircle className="w-4 h-4" />
              {displayError}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading || regnr.length < 5}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-3 px-4 font-semibold rounded-md transition-colors min-h-[48px]',
            isLoading || regnr.length < 5
              ? 'bg-carbon-700 text-carbon-500 cursor-not-allowed'
              : 'bg-glass-cyan hover:bg-glass-cyanLight text-carbon-950'
          )}
        >
          {isLoading ? 'Søker...' : 'Finn bilglass'}
        </button>

        <button
          type="button"
          onClick={onManualSelect}
          className="w-full text-sm text-carbon-500 hover:text-carbon-300 transition-colors"
        >
          Jeg har ikke registreringsnummeret
        </button>
      </form>
    </WizardStepContainer>
  );
}

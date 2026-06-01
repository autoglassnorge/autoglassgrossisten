# Vehicle Search Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single regnr input on the startpage with a guided 5-step wizard that reduces false positives from prefix4 fallback matching.

**Architecture:** Progressive disclosure wizard using React state machine. Exact kType matches skip to results; failed lookups guide users through brand → model → year selection using D1 ktype_registry data. Each step validates before advancing.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, React Router, React Query (or fetch)

---

## File Structure

```
frontend/src/components/search/VehicleWizard/
├── VehicleWizard.tsx          # Main orchestrator with state machine
├── WizardStep.tsx             # Reusable step wrapper (progress, navigation)
├── index.ts                   # Public exports
├── steps/
│   ├── RegnrStep.tsx          # Step 1: Regnr input + kType lookup
│   ├── BrandStep.tsx          # Step 2: Brand selection grid
│   ├── ModelStep.tsx          # Step 3: Model selection (filtered by brand)
│   ├── YearStep.tsx           # Step 4: Year selection (filtered by brand+model)
│   └── SummaryStep.tsx        # Step 5: Confirm + show products
└── hooks/
    ├── useKtypeLookup.ts      # Hook for kType API call
    ├── useVehicleOptions.ts   # Hook for brand/model/year queries
    └── useWizardState.ts      # Wizard state management

frontend/src/components/search/__tests__/
├── useWizardState.test.ts
├── RegnrStep.test.tsx
└── VehicleWizard.test.tsx
```

---

## Task 1: Wizard State Hook

**Files:**
- Create: `frontend/src/components/search/VehicleWizard/hooks/useWizardState.ts`
- Test: `frontend/src/components/search/__tests__/useWizardState.test.ts`

### Step 1: Write the failing test

```typescript
// frontend/src/components/search/__tests__/useWizardState.test.ts
import { renderHook, act } from '@testing-library/react';
import { useWizardState } from '../VehicleWizard/hooks/useWizardState';

describe('useWizardState', () => {
  it('should initialize with regnr step', () => {
    const { result } = renderHook(() => useWizardState());
    expect(result.current.state.step).toBe('regnr');
    expect(result.current.state.regnr).toBe('');
  });

  it('should update regnr and advance to brand step', () => {
    const { result } = renderHook(() => useWizardState());
    
    act(() => {
      result.current.setRegnr('AB12345');
    });
    
    expect(result.current.state.regnr).toBe('AB12345');
    
    act(() => {
      result.current.goToStep('brand');
    });
    
    expect(result.current.state.step).toBe('brand');
  });

  it('should select brand and advance to model step', () => {
    const { result } = renderHook(() => useWizardState());
    
    act(() => {
      result.current.setRegnr('AB12345');
      result.current.goToStep('brand');
      result.current.selectBrand('Volvo');
    });
    
    expect(result.current.state.selectedBrand).toBe('Volvo');
    expect(result.current.state.step).toBe('model');
  });

  it('should allow going back to previous step', () => {
    const { result } = renderHook(() => useWizardState());
    
    act(() => {
      result.current.setRegnr('AB12345');
      result.current.goToStep('brand');
      result.current.selectBrand('Volvo');
    });
    
    expect(result.current.state.step).toBe('model');
    
    act(() => {
      result.current.goBack();
    });
    
    expect(result.current.state.step).toBe('brand');
    expect(result.current.state.selectedBrand).toBeUndefined();
  });

  it('should reset to initial state', () => {
    const { result } = renderHook(() => useWizardState());
    
    act(() => {
      result.current.setRegnr('AB12345');
      result.current.goToStep('brand');
      result.current.selectBrand('Volvo');
      result.current.reset();
    });
    
    expect(result.current.state.step).toBe('regnr');
    expect(result.current.state.regnr).toBe('');
    expect(result.current.state.selectedBrand).toBeUndefined();
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd frontend && npm test -- useWizardState.test.ts --no-coverage 2>&1 | head -30
```

Expected: FAIL with "Cannot find module"

### Step 3: Write minimal implementation

```typescript
// frontend/src/components/search/VehicleWizard/hooks/useWizardState.ts
import { useState, useCallback } from 'react';

export type WizardStep = 'regnr' | 'brand' | 'model' | 'year' | 'summary';

export interface WizardState {
  step: WizardStep;
  regnr: string;
  ktype?: string;
  selectedBrand?: string;
  selectedModel?: string;
  selectedYear?: string;
}

export function useWizardState() {
  const [state, setState] = useState<WizardState>({
    step: 'regnr',
    regnr: '',
  });

  const setRegnr = useCallback((regnr: string) => {
    setState(prev => ({ ...prev, regnr: regnr.toUpperCase().replace(/\s/g, '') }));
  }, []);

  const goToStep = useCallback((step: WizardStep) => {
    setState(prev => ({ ...prev, step }));
  }, []);

  const selectBrand = useCallback((brand: string) => {
    setState(prev => ({ ...prev, selectedBrand: brand, step: 'model' }));
  }, []);

  const selectModel = useCallback((model: string) => {
    setState(prev => ({ ...prev, selectedModel: model, step: 'year' }));
  }, []);

  const selectYear = useCallback((year: string) => {
    setState(prev => ({ ...prev, selectedYear: year, step: 'summary' }));
  }, []);

  const goBack = useCallback(() => {
    setState(prev => {
      switch (prev.step) {
        case 'brand':
          return { ...prev, step: 'regnr' };
        case 'model':
          return { ...prev, step: 'brand', selectedBrand: undefined };
        case 'year':
          return { ...prev, step: 'model', selectedModel: undefined };
        case 'summary':
          if (prev.ktype) {
            return { ...prev, step: 'regnr', ktype: undefined };
          }
          return { ...prev, step: 'year', selectedYear: undefined };
        default:
          return prev;
      }
    });
  }, []);

  const setKtypeMatch = useCallback((ktype: string) => {
    setState(prev => ({ ...prev, ktype, step: 'summary' }));
  }, []);

  const reset = useCallback(() => {
    setState({ step: 'regnr', regnr: '' });
  }, []);

  return {
    state,
    setRegnr,
    goToStep,
    selectBrand,
    selectModel,
    selectYear,
    goBack,
    setKtypeMatch,
    reset,
  };
}
```

### Step 4: Run test to verify it passes

```bash
cd frontend && npm test -- useWizardState.test.ts --no-coverage 2>&1 | tail -20
```

Expected: 5 tests passed

### Step 5: Commit

```bash
git add frontend/src/components/search/VehicleWizard/hooks/useWizardState.ts frontend/src/components/search/__tests__/useWizardState.test.ts
git commit -m "feat(wizard): add useWizardState hook with state machine"
```

---

## Task 2: kType Lookup Hook

**Files:**
- Create: `frontend/src/components/search/VehicleWizard/hooks/useKtypeLookup.ts`
- Modify: `frontend/src/types/api.ts` (add KtypeLookupResponse)

### Step 1: Add types

```typescript
// Add to frontend/src/types/api.ts after KtypeInfo interface

export interface KtypeLookupResponse {
  success: boolean;
  ktype?: number;
  vehicle?: {
    brand: string;
    model: string;
    year: number;
  };
  error?: string;
}
```

### Step 2: Write the hook

```typescript
// frontend/src/components/search/VehicleWizard/hooks/useKtypeLookup.ts
import { useState, useCallback } from 'react';
import type { KtypeLookupResponse } from '@/types/api';

interface UseKtypeLookupReturn {
  lookupKtype: (regnr: string) => Promise<KtypeLookupResponse | null>;
  isLoading: boolean;
  error: string | null;
}

export function useKtypeLookup(): UseKtypeLookupReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookupKtype = useCallback(async (regnr: string): Promise<KtypeLookupResponse | null> => {
    if (!regnr || regnr.length < 5) {
      setError('Ugyldig registreringsnummer');
      return null;
    }

    setIsLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`/api/vehicle/ktype/${encodeURIComponent(regnr)}`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, error: 'Fant ikke kjøretøy' };
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data: KtypeLookupResponse = await response.json();
      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Treg respons — prøv igjen');
      } else {
        setError('Kunne ikke slå opp kjøretøy');
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { lookupKtype, isLoading, error };
}
```

### Step 3: Commit

```bash
git add frontend/src/types/api.ts frontend/src/components/search/VehicleWizard/hooks/useKtypeLookup.ts
git commit -m "feat(wizard): add useKtypeLookup hook with timeout handling"
```

---

## Task 3: Vehicle Options Hook

**Files:**
- Create: `frontend/src/components/search/VehicleWizard/hooks/useVehicleOptions.ts`

### Step 1: Write the hook

```typescript
// frontend/src/components/search/VehicleWizard/hooks/useVehicleOptions.ts
import { useState, useEffect } from 'react';

interface VehicleOptions {
  brands: string[];
  models: string[];
  years: string[];
}

interface UseVehicleOptionsReturn {
  brands: string[];
  models: string[];
  years: string[];
  isLoading: boolean;
  error: string | null;
}

export function useVehicleOptions(
  selectedBrand?: string,
  selectedModel?: string
): UseVehicleOptionsReturn {
  const [options, setOptions] = useState<VehicleOptions>({
    brands: [],
    models: [],
    years: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch brands on mount
  useEffect(() => {
    const fetchBrands = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/vehicle/brands');
        if (!response.ok) throw new Error('Failed to fetch brands');
        const data = await response.json();
        setOptions(prev => ({ ...prev, brands: data.brands || [] }));
      } catch {
        setError('Kunne ikke laste merker');
        // Fallback: empty array, component should handle gracefully
        setOptions(prev => ({ ...prev, brands: [] }));
      } finally {
        setIsLoading(false);
      }
    };

    fetchBrands();
  }, []);

  // Fetch models when brand changes
  useEffect(() => {
    if (!selectedBrand) {
      setOptions(prev => ({ ...prev, models: [], years: [] }));
      return;
    }

    const fetchModels = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/vehicle/models?brand=${encodeURIComponent(selectedBrand)}`);
        if (!response.ok) throw new Error('Failed to fetch models');
        const data = await response.json();
        setOptions(prev => ({ ...prev, models: data.models || [], years: [] }));
      } catch {
        setError('Kunne ikke laste modeller');
        setOptions(prev => ({ ...prev, models: [] }));
      } finally {
        setIsLoading(false);
      }
    };

    fetchModels();
  }, [selectedBrand]);

  // Fetch years when brand and model change
  useEffect(() => {
    if (!selectedBrand || !selectedModel) {
      setOptions(prev => ({ ...prev, years: [] }));
      return;
    }

    const fetchYears = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          brand: selectedBrand,
          model: selectedModel,
        });
        const response = await fetch(`/api/vehicle/years?${params}`);
        if (!response.ok) throw new Error('Failed to fetch years');
        const data = await response.json();
        setOptions(prev => ({ ...prev, years: data.years || [] }));
      } catch {
        setError('Kunne ikke laste årsmodeller');
        setOptions(prev => ({ ...prev, years: [] }));
      } finally {
        setIsLoading(false);
      }
    };

    fetchYears();
  }, [selectedBrand, selectedModel]);

  return {
    brands: options.brands,
    models: options.models,
    years: options.years,
    isLoading,
    error,
  };
}
```

### Step 2: Commit

```bash
git add frontend/src/components/search/VehicleWizard/hooks/useVehicleOptions.ts
git commit -m "feat(wizard): add useVehicleOptions hook for brand/model/year fetching"
```

---

## Task 4: WizardStep Component

**Files:**
- Create: `frontend/src/components/search/VehicleWizard/WizardStep.tsx`

### Step 1: Write the component

```tsx
// frontend/src/components/search/VehicleWizard/WizardStep.tsx
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WizardStep } from './hooks/useWizardState';

interface WizardStepProps {
  step: WizardStep;
  currentStep: WizardStep;
  title: string;
  subtitle?: string;
  canGoBack: boolean;
  canProceed: boolean;
  onBack: () => void;
  onNext?: () => void;
  nextLabel?: string;
  children: React.ReactNode;
}

const stepOrder: WizardStep[] = ['regnr', 'brand', 'model', 'year', 'summary'];

export function WizardStepContainer({
  step,
  currentStep,
  title,
  subtitle,
  canGoBack,
  canProceed,
  onBack,
  onNext,
  nextLabel = 'Neste',
  children,
}: WizardStepProps) {
  const currentIndex = stepOrder.indexOf(currentStep);
  const stepIndex = stepOrder.indexOf(step);
  const isActive = step === currentStep;
  const isPast = stepIndex < currentIndex;

  if (!isActive) return null;

  return (
    <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Progress indicator */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          {stepOrder.slice(0, -1).map((s, idx) => (
            <div key={s} className="flex items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                  idx < currentIndex && 'bg-glass-cyan text-carbon-950',
                  idx === currentIndex && 'bg-carbon-700 text-glass-cyan border border-glass-cyan',
                  idx > currentIndex && 'bg-carbon-800 text-carbon-500'
                )}
              >
                {idx < currentIndex ? '✓' : idx + 1}
              </div>
              {idx < stepOrder.length - 2 && (
                <ChevronRight className="w-4 h-4 text-carbon-600 mx-1" />
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-carbon-500 font-mono uppercase tracking-wider">
          Steg {currentIndex + 1} av {stepOrder.length - 1}
        </p>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white mb-1">{title}</h2>
        {subtitle && <p className="text-sm text-carbon-400">{subtitle}</p>}
      </div>

      {/* Content */}
      <div className="bg-carbon-800/50 border border-carbon-700 rounded-lg p-6 mb-6">
        {children}
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        {canGoBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2.5 text-carbon-300 hover:text-white hover:bg-carbon-800 rounded-md transition-colors min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            Tilbake
          </button>
        )}
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={!canProceed}
            className={cn(
              'ml-auto flex items-center gap-2 px-6 py-2.5 font-semibold rounded-md transition-colors min-h-[44px]',
              canProceed
                ? 'bg-glass-cyan hover:bg-glass-cyanLight text-carbon-950'
                : 'bg-carbon-700 text-carbon-500 cursor-not-allowed'
            )}
          >
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}
```

### Step 2: Commit

```bash
git add frontend/src/components/search/VehicleWizard/WizardStep.tsx
git commit -m "feat(wizard): add WizardStep container component with progress indicator"
```

---

## Task 5: RegnrStep Component

**Files:**
- Create: `frontend/src/components/search/VehicleWizard/steps/RegnrStep.tsx`

### Step 1: Write the component

```tsx
// frontend/src/components/search/VehicleWizard/steps/RegnrStep.tsx
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
```

### Step 2: Commit

```bash
git add frontend/src/components/search/VehicleWizard/steps/RegnrStep.tsx
git commit -m "feat(wizard): add RegnrStep with validation and kType lookup"
```

---

## Task 6: BrandStep Component

**Files:**
- Create: `frontend/src/components/search/VehicleWizard/steps/BrandStep.tsx`

### Step 1: Write the component

```tsx
// frontend/src/components/search/VehicleWizard/steps/BrandStep.tsx
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
```

### Step 2: Commit

```bash
git add frontend/src/components/search/VehicleWizard/steps/BrandStep.tsx
git commit -m "feat(wizard): add BrandStep with search and selection grid"
```

---

## Task 7: ModelStep Component

**Files:**
- Create: `frontend/src/components/search/VehicleWizard/steps/ModelStep.tsx`

### Step 1: Write the component

```tsx
// frontend/src/components/search/VehicleWizard/steps/ModelStep.tsx
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
```

### Step 2: Commit

```bash
git add frontend/src/components/search/VehicleWizard/steps/ModelStep.tsx
git commit -m "feat(wizard): add ModelStep with series grouping and search"
```

---

## Task 8: YearStep Component

**Files:**
- Create: `frontend/src/components/search/VehicleWizard/steps/YearStep.tsx`

### Step 1: Write the component

```tsx
// frontend/src/components/search/VehicleWizard/steps/YearStep.tsx
import { useState } from 'react';
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

  const handleContinue = () => {
    if (selectedYear) {
      onSelectYear(selectedYear);
    }
  };

  // Parse year ranges for display
  const parseYearDisplay = (yearStr: string): { range: string; gen?: string } => {
    // Handle formats like "2018-2022" or "2018-2022 (G20)"
    const match = yearStr.match(/(\d{4}-\d{4})(?:\s*\(([^)]+)\))?/);
    if (match) {
      return { range: match[1], gen: match[2] };
    }
    return { range: yearStr };
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

        {/* Year selection */}
        {!isLoading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto">
            {years.map((yearStr) => {
              const { range, gen } = parseYearDisplay(yearStr);
              return (
                <button
                  key={yearStr}
                  type="button"
                  onClick={() => setSelectedYear(yearStr)}
                  className={cn(
                    'p-4 text-left rounded-lg border transition-all',
                    selectedYear === yearStr
                      ? 'bg-glass-cyan/10 border-glass-cyan'
                      : 'bg-carbon-900 border-carbon-700 hover:border-carbon-600'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                        selectedYear === yearStr
                          ? 'bg-glass-cyan text-carbon-950'
                          : 'bg-carbon-800 text-carbon-400'
                      )}
                    >
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <p
                        className={cn(
                          'font-semibold',
                          selectedYear === yearStr ? 'text-glass-cyan' : 'text-white'
                        )}
                      >
                        {range}
                      </p>
                      {gen && (
                        <p className="text-xs text-carbon-500 mt-0.5">
                          Generasjon {gen}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && years.length === 0 && (
          <div className="text-center py-4">
            <p className="text-carbon-500">
              Ingen årsmodeller funnet for {selectedBrand} {selectedModel}
            </p>
          </div>
        )}
      </div>
    </WizardStepContainer>
  );
}
```

### Step 2: Commit

```bash
git add frontend/src/components/search/VehicleWizard/steps/YearStep.tsx
git commit -m "feat(wizard): add YearStep with year range selection"
```

---

## Task 9: SummaryStep Component

**Files:**
- Create: `frontend/src/components/search/VehicleWizard/steps/SummaryStep.tsx`
- Modify: `frontend/src/types/api.ts` (ensure SearchResult is exported)

### Step 1: Write the component

```tsx
// frontend/src/components/search/VehicleWizard/steps/SummaryStep.tsx
import { useEffect, useState } from 'react';
import { ArrowLeft, RotateCcw, Package, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WizardStepContainer } from '../WizardStep';
import type { WizardStep as StepType } from '../hooks/useWizardState';
import type { Product, VehicleInfo } from '@/types/api';

interface SummaryStepProps {
  currentStep: StepType;
  regnr: string;
  ktype?: string;
  selectedBrand?: string;
  selectedModel?: string;
  selectedYear?: string;
  vehicleFromKtype?: {
    brand: string;
    model: string;
    year: number;
  };
  onBack: () => void;
  onReset: () => void;
}

export function SummaryStep({
  currentStep,
  regnr,
  ktype,
  selectedBrand,
  selectedModel,
  selectedYear,
  vehicleFromKtype,
  onBack,
  onReset,
}: SummaryStepProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        
        // Prioritize kType if available
        if (ktype) {
          params.set('ktype', ktype);
        } else if (selectedBrand && selectedModel && selectedYear) {
          params.set('brand', selectedBrand);
          params.set('model', selectedModel);
          params.set('year', selectedYear);
        }

        const response = await fetch(`/api/products/search?${params}`);
        if (!response.ok) throw new Error('Failed to fetch products');
        
        const data = await response.json();
        setProducts(data.products || []);
      } catch {
        setError('Kunne ikke laste produkter');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, [ktype, selectedBrand, selectedModel, selectedYear]);

  // Build vehicle display info
  const vehicleDisplay = vehicleFromKtype || (ktype
    ? { brand: selectedBrand || '', model: selectedModel || '', year: parseInt(selectedYear || '0') }
    : { brand: selectedBrand || '', model: selectedModel || '', year: parseInt(selectedYear?.split('-')[0] || '0') }
  );

  return (
    <WizardStepContainer
      step="summary"
      currentStep={currentStep}
      title="Bekreft kjøretøy"
      canGoBack={true}
      canProceed={false}
      onBack={onBack}
    >
      <div className="space-y-6">
        {/* Vehicle summary */}
        <div className="bg-carbon-900 rounded-lg p-4 border border-carbon-700">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-carbon-500 uppercase tracking-wider mb-1">
                {ktype ? 'Funnet fra registreringsnummer' : 'Valgt manuelt'}
              </p>
              <h3 className="text-lg font-bold text-white">
                {vehicleDisplay.brand} {vehicleDisplay.model}
              </h3>
              <p className="text-carbon-400">
                {vehicleDisplay.year}{selectedYear?.includes('-') ? ` (${selectedYear})` : ''}
              </p>
              {ktype && (
                <p className="text-xs text-carbon-500 mt-1">
                  kType: {ktype}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onReset}
              className="text-sm text-carbon-500 hover:text-carbon-300 flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Søk igjen
            </button>
          </div>
        </div>

        {/* Products */}
        <div>
          <h4 className="text-sm font-medium text-carbon-300 mb-3">
            Tilgjengelige produkter
          </h4>

          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-glass-cyan border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-800 rounded-md text-sm text-red-400">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {!isLoading && !error && products.length === 0 && (
            <div className="text-center py-8 bg-carbon-900 rounded-lg border border-carbon-700">
              <Package className="w-8 h-8 text-carbon-600 mx-auto mb-2" />
              <p className="text-carbon-400">Ingen produkter funnet</p>
              <p className="text-sm text-carbon-500 mt-1">
                Prøv å søke med andre kriterier
              </p>
              <button
                type="button"
                onClick={onBack}
                className="mt-3 text-sm text-glass-cyan hover:underline inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                Gå tilbake
              </button>
            </div>
          )}

          {!isLoading && !error && products.length > 0 && (
            <div className="space-y-3">
              {products.map((product) => (
                <a
                  key={product.id}
                  href={`/produkt/${product.id}`}
                  className="flex items-center gap-4 p-3 bg-carbon-900 rounded-lg border border-carbon-700 hover:border-carbon-600 transition-colors"
                >
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.title}
                      className="w-16 h-16 object-cover rounded-md bg-carbon-800"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-carbon-800 rounded-md flex items-center justify-center">
                      <Package className="w-6 h-6 text-carbon-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{product.title}</p>
                    <p className="text-sm text-carbon-500">{product.brand}</p>
                    <p className="text-sm text-glass-cyan mt-1">
                      {product.price.toLocaleString('nb-NO')} kr
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </WizardStepContainer>
  );
}
```

### Step 2: Commit

```bash
git add frontend/src/components/search/VehicleWizard/steps/SummaryStep.tsx
git commit -m "feat(wizard): add SummaryStep with product display"
```

---

## Task 10: Main VehicleWizard Component

**Files:**
- Create: `frontend/src/components/search/VehicleWizard/VehicleWizard.tsx`
- Create: `frontend/src/components/search/VehicleWizard/index.ts`

### Step 1: Write the main component

```tsx
// frontend/src/components/search/VehicleWizard/VehicleWizard.tsx
import { useWizardState } from './hooks/useWizardState';
import { useKtypeLookup } from './hooks/useKtypeLookup';
import { useVehicleOptions } from './hooks/useVehicleOptions';
import { RegnrStep } from './steps/RegnrStep';
import { BrandStep } from './steps/BrandStep';
import { ModelStep } from './steps/ModelStep';
import { YearStep } from './steps/YearStep';
import { SummaryStep } from './steps/SummaryStep';
import type { KtypeLookupResponse } from '@/types/api';

export function VehicleWizard() {
  const {
    state,
    setRegnr,
    goToStep,
    selectBrand,
    selectModel,
    selectYear,
    goBack,
    setKtypeMatch,
    reset,
  } = useWizardState();

  const { lookupKtype, isLoading: isKtypeLoading, error: ktypeError } = useKtypeLookup();
  const { brands, models, years, isLoading: isOptionsLoading, error: optionsError } = useVehicleOptions(
    state.selectedBrand,
    state.selectedModel
  );

  const [vehicleFromKtype, setVehicleFromKtype] = useState<KtypeLookupResponse['vehicle'] | undefined>();

  const handleKtypeFound = (ktype: string, vehicle?: KtypeLookupResponse['vehicle']) => {
    setVehicleFromKtype(vehicle);
    setKtypeMatch(ktype);
  };

  const handleManualSelect = () => {
    goToStep('brand');
  };

  return (
    <div className="w-full">
      <RegnrStep
        currentStep={state.step}
        regnr={state.regnr}
        onRegnrChange={setRegnr}
        onKtypeFound={handleKtypeFound}
        onManualSelect={handleManualSelect}
        lookupKtype={lookupKtype}
        isLoading={isKtypeLoading}
        error={ktypeError}
      />

      <BrandStep
        currentStep={state.step}
        brands={brands}
        isLoading={isOptionsLoading}
        error={optionsError}
        onSelectBrand={selectBrand}
        onBack={goBack}
      />

      <ModelStep
        currentStep={state.step}
        selectedBrand={state.selectedBrand || ''}
        models={models}
        isLoading={isOptionsLoading}
        error={optionsError}
        onSelectModel={selectModel}
        onBack={goBack}
      />

      <YearStep
        currentStep={state.step}
        selectedBrand={state.selectedBrand || ''}
        selectedModel={state.selectedModel || ''}
        years={years}
        isLoading={isOptionsLoading}
        error={optionsError}
        onSelectYear={selectYear}
        onBack={goBack}
      />

      <SummaryStep
        currentStep={state.step}
        regnr={state.regnr}
        ktype={state.ktype}
        selectedBrand={state.selectedBrand}
        selectedModel={state.selectedModel}
        selectedYear={state.selectedYear}
        vehicleFromKtype={vehicleFromKtype}
        onBack={goBack}
        onReset={reset}
      />
    </div>
  );
}
```

Wait, I need to add the import for useState at the top:

```tsx
// frontend/src/components/search/VehicleWizard/VehicleWizard.tsx
import { useState } from 'react';
import { useWizardState } from './hooks/useWizardState';
...
```

### Step 2: Write the index file

```typescript
// frontend/src/components/search/VehicleWizard/index.ts
export { VehicleWizard } from './VehicleWizard';
export { useWizardState, type WizardState, type WizardStep } from './hooks/useWizardState';
```

### Step 3: Commit

```bash
git add frontend/src/components/search/VehicleWizard/VehicleWizard.tsx frontend/src/components/search/VehicleWizard/index.ts
git commit -m "feat(wizard): add main VehicleWizard orchestrator component"
```

---

## Task 11: Update HeroSearch to use VehicleWizard

**Files:**
- Modify: `frontend/src/components/home/HeroSearch.tsx`

### Step 1: Replace HeroSearch content

```tsx
// frontend/src/components/home/HeroSearch.tsx
import { VehicleWizard } from '../search/VehicleWizard';

export function HeroSearch() {
  return (
    <div className="w-full">
      <VehicleWizard />
    </div>
  );
}
```

### Step 2: Commit

```bash
git add frontend/src/components/home/HeroSearch.tsx
git commit -m "feat(wizard): integrate VehicleWizard into HeroSearch"
```

---

## Task 12: Add Tests

**Files:**
- Create: `frontend/src/components/search/__tests__/RegnrStep.test.tsx`

### Step 1: Write tests

```tsx
// frontend/src/components/search/__tests__/RegnrStep.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegnrStep } from '../VehicleWizard/steps/RegnrStep';

describe('RegnrStep', () => {
  const mockLookupKtype = vi.fn();
  const mockOnKtypeFound = vi.fn();
  const mockOnManualSelect = vi.fn();
  const mockOnRegnrChange = vi.fn();

  const defaultProps = {
    currentStep: 'regnr' as const,
    regnr: '',
    onRegnrChange: mockOnRegnrChange,
    onKtypeFound: mockOnKtypeFound,
    onManualSelect: mockOnManualSelect,
    lookupKtype: mockLookupKtype,
    isLoading: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders regnr input field', () => {
    render(<RegnrStep {...defaultProps} />);
    expect(screen.getByPlaceholderText('AB 12345')).toBeInTheDocument();
  });

  it('normalizes regnr to uppercase', () => {
    render(<RegnrStep {...defaultProps} />);
    const input = screen.getByPlaceholderText('AB 12345');
    fireEvent.change(input, { target: { value: 'ab12345' } });
    expect(mockOnRegnrChange).toHaveBeenCalledWith('AB12345');
  });

  it('shows error for invalid regnr format', async () => {
    render(<RegnrStep {...defaultProps} regnr="INVALID" />);
    const button = screen.getByText('Finn bilglass');
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(screen.getByText(/Ugyldig registreringsnummer/)).toBeInTheDocument();
    });
  });

  it('calls lookupKtype on valid submit', async () => {
    mockLookupKtype.mockResolvedValue({ success: false });
    render(<RegnrStep {...defaultProps} regnr="AB12345" />);
    
    const button = screen.getByText('Finn bilglass');
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(mockLookupKtype).toHaveBeenCalledWith('AB12345');
    });
  });

  it('skips to summary on kType match', async () => {
    mockLookupKtype.mockResolvedValue({
      success: true,
      ktype: 12345,
      vehicle: { brand: 'Volvo', model: 'V70', year: 2018 },
    });
    render(<RegnrStep {...defaultProps} regnr="AB12345" />);
    
    const button = screen.getByText('Finn bilglass');
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(mockOnKtypeFound).toHaveBeenCalledWith('12345', {
        brand: 'Volvo',
        model: 'V70',
        year: 2018,
      });
    });
  });

  it('goes to manual select when kType not found', async () => {
    mockLookupKtype.mockResolvedValue({ success: false });
    render(<RegnrStep {...defaultProps} regnr="AB12345" />);
    
    const button = screen.getByText('Finn bilglass');
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(mockOnManualSelect).toHaveBeenCalled();
    });
  });
});
```

### Step 2: Run tests

```bash
cd frontend && npm test -- RegnrStep.test.tsx --no-coverage 2>&1 | tail -20
```

Expected: All tests pass

### Step 3: Commit

```bash
git add frontend/src/components/search/__tests__/RegnrStep.test.tsx
git commit -m "test(wizard): add RegnrStep tests"
```

---

## Task 13: Build Verification

### Step 1: Run build

```bash
cd frontend && npm run build 2>&1 | tail -30
```

Expected: Build succeeds with no TypeScript errors

### Step 2: Run all tests

```bash
cd frontend && npm test -- --no-coverage --passWithNoTests 2>&1 | tail -20
```

Expected: All tests pass

### Step 3: Final commit

```bash
git add -A
git commit -m "feat(wizard): complete VehicleWizard implementation for startpage"
```

---

## Plan Self-Review

### Spec Coverage Check

| Spec Requirement | Implementing Task |
|-----------------|-------------------|
| 5-step wizard flow | Tasks 5-9, orchestrated in Task 10 |
| kType lookup with timeout | Task 2 |
| Brand/model/year cascading fetch | Task 3 |
| Progress indicator | Task 4 |
| Back navigation | useWizardState hook in Task 1 |
| Mobile responsive | Tailwind classes throughout |
| Error handling | Each step has error states |
| Loading states | Skeleton/spinner in each step |
| Product display in summary | Task 9 |
| Tests | Tasks 1, 12 |

### Placeholder Scan
- No TBD/TODO found
- All code blocks are complete implementations
- All commands have expected outputs

### Type Consistency
- `WizardStep` type used consistently across all components
- `KtypeLookupResponse` type added to api.ts and used in hook
- Props interfaces match between parent and child components

---

## Post-Implementation Notes

### API Endpoints Required (Worker-side)
These endpoints must be implemented in the Cloudflare Worker:

1. `GET /api/vehicle/ktype/:regnr` → Returns `{success, ktype?, vehicle?, error?}`
2. `GET /api/vehicle/brands` → Returns `{brands: string[]}`
3. `GET /api/vehicle/models?brand=X` → Returns `{models: string[]}`
4. `GET /api/vehicle/years?brand=X&model=Y` → Returns `{years: string[]}`
5. `GET /api/products/search?ktype=X` → Returns `{products: Product[]}`

If these endpoints don't exist, they need to be added as a separate task.

### Optional Enhancements (Future)
- Analytics tracking (spec section 7)
- Framer Motion transitions between steps
- Virtual scrolling for large model lists
- Brand logos instead of text buttons

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

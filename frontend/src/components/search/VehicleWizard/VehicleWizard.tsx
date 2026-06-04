import { useWizardState } from './hooks/useWizardState';
import { useKtypeLookup } from './hooks/useKtypeLookup';
import { useVehicleOptions } from './hooks/useVehicleOptions';
import { RegnrStep } from './steps/RegnrStep';
import { BrandStep } from './steps/BrandStep';
import { ModelStep } from './steps/ModelStep';
import { YearStep } from './steps/YearStep';
import { SummaryStep } from './steps/SummaryStep';
import type { KtypeLookupResponse } from '@/types/api';

interface VehicleWizardProps {
  onComplete?: () => void;
}

export function VehicleWizard({ onComplete }: VehicleWizardProps) {
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
  const {
    brands,
    models,
    years,
    isLoading: isOptionsLoading,
    error: optionsError,
  } = useVehicleOptions(state.selectedBrand, state.selectedModel);

  // Handle successful kType lookup
  const handleKtypeFound = (ktype: string, vehicle: KtypeLookupResponse['vehicle']) => {
    setKtypeMatch(ktype, vehicle ?? undefined);
    onComplete?.();
  };

  // Handle manual selection (kType not found)
  const handleManualSelect = () => {
    goToStep('brand');
  };

  // Handle brand selection
  const handleSelectBrand = (brand: string) => {
    selectBrand(brand);
  };

  // Handle model selection
  const handleSelectModel = (model: string) => {
    selectModel(model);
  };

  // Handle year selection
  const handleSelectYear = (year: string) => {
    selectYear(year);
    onComplete?.();
  };

  // Handle reset
  const handleReset = () => {
    reset();
  };

  // Handle back navigation
  const handleBack = () => {
    goBack();
  };

  return (
    <div className="w-full">
      {/* Step 1: Regnr Input */}
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

      {/* Step 2: Brand Selection */}
      <BrandStep
        currentStep={state.step}
        brands={brands}
        isLoading={isOptionsLoading}
        error={optionsError}
        onSelectBrand={handleSelectBrand}
        onBack={handleBack}
      />

      {/* Step 3: Model Selection */}
      {state.selectedBrand && (
        <ModelStep
          currentStep={state.step}
          selectedBrand={state.selectedBrand}
          models={models}
          isLoading={isOptionsLoading}
          error={optionsError}
          onSelectModel={handleSelectModel}
          onBack={handleBack}
        />
      )}

      {/* Step 4: Year Selection */}
      {state.selectedBrand && state.selectedModel && (
        <YearStep
          currentStep={state.step}
          selectedBrand={state.selectedBrand}
          selectedModel={state.selectedModel}
          years={years}
          isLoading={isOptionsLoading}
          error={optionsError}
          onSelectYear={handleSelectYear}
          onBack={handleBack}
        />
      )}

      {/* Step 5: Summary & Results */}
      <SummaryStep
        currentStep={state.step}
        regnr={state.regnr}
        ktype={state.ktype}
        ktypeVehicle={state.ktypeVehicle}
        selectedBrand={state.selectedBrand}
        selectedModel={state.selectedModel}
        selectedYear={state.selectedYear}
        onReset={handleReset}
        onBack={handleBack}
      />
    </div>
  );
}

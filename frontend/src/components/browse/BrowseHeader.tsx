import { X, ArrowLeft } from 'lucide-react';
import BreadcrumbNav from './BreadcrumbNav';

interface BrowseHeaderProps {
  currentStep: 'brand' | 'model' | 'year' | 'products';
  selectedBrand?: string;
  selectedModel?: string;
  selectedYear?: string;
  resultCount?: number;
  onClearAll: () => void;
  onStepClick: (step: 'brand' | 'model' | 'year') => void;
}

export default function BrowseHeader({
  currentStep,
  selectedBrand,
  selectedModel,
  selectedYear,
  resultCount,
  onClearAll,
  onStepClick,
}: BrowseHeaderProps) {
  const breadcrumbItems = [
    {
      label: selectedBrand || 'Velg merke',
      step: 'brand' as const,
      isActive: currentStep === 'brand',
      hasValue: !!selectedBrand,
    },
    {
      label: selectedModel || 'Velg modell',
      step: 'model' as const,
      isActive: currentStep === 'model',
      hasValue: !!selectedModel,
    },
    {
      label: selectedYear || 'Velg år',
      step: 'year' as const,
      isActive: currentStep === 'year',
      hasValue: !!selectedYear,
    },
  ];

  const hasAnySelection = selectedBrand || selectedModel || selectedYear;

  // Find the previous step for mobile back button
  const getPreviousStep = (): 'brand' | 'model' | 'year' | null => {
    if (currentStep === 'model') return 'brand';
    if (currentStep === 'year') return 'model';
    if (currentStep === 'products') return 'year';
    return null;
  };

  const previousStep = getPreviousStep();

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a href="/" className="flex items-center flex-shrink-0">
            <img
              src="/logo.png"
              alt="Autoglass"
              className="h-8 w-auto"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <span className="ml-2 text-xl font-bold text-autoglass-blue">
              Autoglass
            </span>
          </a>

          {/* Desktop Breadcrumb */}
          <div className="hidden md:flex flex-1 justify-center mx-8">
            <BreadcrumbNav
              items={breadcrumbItems.map(({ label, step, isActive }) => ({
                label,
                step,
                isActive,
              }))}
              onItemClick={onStepClick}
            />
          </div>

          {/* Mobile: Show back button when applicable */}
          {previousStep && (
            <button
              onClick={() => onStepClick(previousStep)}
              className="md:hidden flex items-center text-sm text-gray-600 hover:text-gray-900 mr-4"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Tilbake
            </button>
          )}

          {/* Right side: Result count and Clear button */}
          <div className="flex items-center gap-4">
            {resultCount !== undefined && currentStep === 'products' && (
              <span className="text-sm text-gray-500 hidden sm:block">
                {resultCount} {resultCount === 1 ? 'produkt' : 'produkter'}
              </span>
            )}
            {hasAnySelection && (
              <button
                onClick={onClearAll}
                className="flex items-center text-sm text-gray-500 hover:text-red-600 transition-colors"
              >
                <span className="hidden sm:inline">Nullstill</span>
                <X className="w-4 h-4 sm:ml-1" />
              </button>
            )}
          </div>
        </div>

        {/* Mobile Breadcrumb (simplified) */}
        <div className="md:hidden pb-3 border-t border-gray-100 pt-2">
          <BreadcrumbNav
            items={breadcrumbItems.map(({ label, step, isActive, hasValue }) => ({
              label: hasValue ? label.split(':').pop()?.trim() || label : label,
              step,
              isActive,
            }))}
            onItemClick={onStepClick}
            isMobile
          />
        </div>
      </div>
    </header>
  );
}

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
  const isActive = step === currentStep;

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
          {currentStep === 'summary' ? 'Sammendrag' : `Steg ${currentIndex + 1} av ${stepOrder.length - 1}`}
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

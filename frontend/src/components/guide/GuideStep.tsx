import { useState } from 'react';
import { HelpCircle, ChevronLeft, Loader2 } from 'lucide-react';
import type { GuideQuestion } from '@/api/glass';

interface GuideStepProps {
  question: GuideQuestion;
  onAnswer: (value: string) => void;
  onBack?: () => void;
  isLoading?: boolean;
}

export function GuideStep({ question, onAnswer, onBack, isLoading }: GuideStepProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showReason, setShowReason] = useState(false);

  const handleSelect = (value: string) => {
    setSelected(value);
    // Liten delay for visuell feedback før neste steg
    setTimeout(() => onAnswer(value), 150);
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Spørsmål */}
      <div className="text-center mb-8">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
          {question.label}
        </h2>
        {question.reason && (
          <button
            onClick={() => setShowReason(!showReason)}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-autoglass-blue transition"
          >
            <HelpCircle className="w-4 h-4" />
            {showReason ? 'Skjul forklaring' : 'Hvorfor spør vi?'}
          </button>
        )}
        {showReason && question.reason && (
          <p className="mt-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
            {question.reason}
          </p>
        )}
      </div>

      {/* Svar-alternativer */}
      <div className="space-y-3">
        {question.options?.map((option) => (
          <button
            key={option.value}
            onClick={() => handleSelect(option.value)}
            disabled={isLoading || selected !== null}
            className={`w-full p-4 sm:p-5 rounded-xl border-2 text-left transition-all duration-200 ${
              selected === option.value
                ? 'border-autoglass-blue bg-autoglass-blue/5 ring-2 ring-autoglass-blue/20'
                : 'border-gray-200 hover:border-autoglass-blue/50 hover:bg-gray-50'
            } ${selected !== null && selected !== option.value ? 'opacity-50' : ''}`}
          >
            <span className="text-base sm:text-lg font-medium text-gray-900">
              {option.label}
            </span>
          </button>
        ))}
      </div>

      {/* Tilbake-knapp */}
      {onBack && (
        <div className="mt-6 text-center">
          <button
            onClick={onBack}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition"
          >
            <ChevronLeft className="w-4 h-4" />
            Tilbake
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="mt-6 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-autoglass-blue" />
        </div>
      )}
    </div>
  );
}

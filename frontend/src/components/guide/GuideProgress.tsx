import { Check } from 'lucide-react';

interface GuideProgressProps {
  current: number;
  total: number;
}

export function GuideProgress({ current, total }: GuideProgressProps) {
  const progress = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500">
          Steg {current} av {total}
        </span>
        <span className="text-xs font-medium text-gray-500">
          {Math.round(progress)}%
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-autoglass-blue rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between mt-2">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors ${
              i + 1 < current
                ? 'bg-autoglass-blue text-white'
                : i + 1 === current
                ? 'bg-autoglass-blue text-white ring-2 ring-autoglass-blue/30'
                : 'bg-gray-200 text-gray-400'
            }`}
          >
            {i + 1 < current ? <Check className="w-3.5 h-3.5" /> : i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

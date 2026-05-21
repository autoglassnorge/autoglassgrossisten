import { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConfidenceInfo } from '@/types/api';
import { confidenceFromScore } from '@/utils/formatters';

interface ConfidenceBadgeProps {
  confidence: ConfidenceInfo;
  showDetails?: boolean;
}

export function ConfidenceBadge({ confidence, showDetails = true }: ConfidenceBadgeProps) {
  const [expanded, setExpanded] = useState(false);
  const info = confidenceFromScore(confidence.score);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => showDetails && setExpanded(!expanded)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold min-h-[28px]',
          info.colorClass,
          showDetails && 'cursor-pointer'
        )}
      >
        {info.variant === 'low' || info.variant === 'guess' ? (
          <AlertTriangle className="h-3 w-3" />
        ) : null}
        <span>{info.label}</span>
        {showDetails && (
          expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {showDetails && expanded && (
        <div className="mt-2 rounded-lg border bg-white p-3 text-sm shadow-sm animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-900">Score: {confidence.score}%</span>
            <span className="text-xs text-gray-500">{confidence.groundTruth ? 'Ground truth' : 'Avledet'}</span>
          </div>
          {confidence.reasons.length > 0 && (
            <ul className="mt-2 space-y-1">
              {confidence.reasons.map((reason, i) => (
                <li key={i} className="flex items-start gap-1.5 text-gray-600">
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-gray-400 flex-shrink-0" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          )}
          {info.message && (
            <p className="mt-2 text-xs font-medium text-red-600">{info.message}</p>
          )}
        </div>
      )}
    </div>
  );
}

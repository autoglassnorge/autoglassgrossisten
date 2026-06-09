import { CheckCircle2, Info, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { MatchExplanation } from '@/api/ordremottaker';

interface MatchExplanationPanelProps {
  explanation: MatchExplanation;
}

const CONFIDENCE_LABELS: Record<MatchExplanation['confidence'], string> = {
  exact: 'Eksakt',
  high: 'Høy',
  medium: 'Medium',
  low: 'Lav',
  none: 'Ingen',
};

function getConfidenceStyles(confidence: MatchExplanation['confidence']) {
  switch (confidence) {
    case 'exact':
    case 'high':
      return {
        icon: <ShieldCheck className="h-4 w-4" />,
        className: 'border-green-200 bg-green-50 text-green-700',
      };
    case 'medium':
      return {
        icon: <Info className="h-4 w-4" />,
        className: 'border-blue-200 bg-blue-50 text-blue-700',
      };
    case 'low':
      return {
        icon: <TriangleAlert className="h-4 w-4" />,
        className: 'border-yellow-200 bg-yellow-50 text-yellow-800',
      };
    case 'none':
    default:
      return {
        icon: <TriangleAlert className="h-4 w-4" />,
        className: 'border-gray-200 bg-gray-50 text-gray-600',
      };
  }
}

export default function MatchExplanationPanel({ explanation }: MatchExplanationPanelProps) {
  const confidence = getConfidenceStyles(explanation.confidence);

  return (
    <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-autoglass-blue" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">Match</div>
            {explanation.vehicle && (
              <div className="truncate text-xs text-gray-500">
                {explanation.vehicle.make} {explanation.vehicle.model} ({explanation.vehicle.year})
              </div>
            )}
          </div>
        </div>
        <div className={`flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${confidence.className}`}>
          {confidence.icon}
          {CONFIDENCE_LABELS[explanation.confidence]}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-2 text-xs">
        <span className="rounded-md bg-gray-100 px-2 py-1 text-gray-700">
          Lag {explanation.layer}: {explanation.layerName}
        </span>
        {explanation.vehicle?.regnr && (
          <span className="rounded-md bg-gray-100 px-2 py-1 text-gray-700">
            {explanation.vehicle.regnr}
          </span>
        )}
      </div>

      {explanation.reasons.length > 0 && (
        <ul className="space-y-1 text-xs text-gray-600">
          {explanation.reasons.slice(0, 3).map((reason) => (
            <li key={reason} className="leading-relaxed">
              {reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

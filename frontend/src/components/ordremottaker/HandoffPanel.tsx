import { PhoneCall } from 'lucide-react';
import type { HandoffSummary } from '@/api/ordremottaker';

interface HandoffPanelProps {
  summary: HandoffSummary;
}

const REASON_LABELS: Record<HandoffSummary['reason'], string> = {
  no_match: 'Ingen treff',
  low_confidence: 'Lav sikkerhet',
  multiple_vehicles: 'Flere muligheter',
  customer_request: 'Kunde ønsker kontakt',
  equipment_unclear: 'Utstyr må avklares',
};

export default function HandoffPanel({ summary }: HandoffPanelProps) {
  return (
    <div className="mb-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <PhoneCall className="h-4 w-4 text-yellow-700" />
        <div>
          <div className="text-sm font-semibold text-yellow-900">Overføring</div>
          <div className="text-xs font-medium text-yellow-800">{REASON_LABELS[summary.reason]}</div>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-yellow-900">{summary.summary}</p>
      {summary.sessionToken && (
        <div className="mt-2 rounded-md bg-white/70 px-2 py-1 text-xs text-yellow-900">
          Session: {summary.sessionToken}
        </div>
      )}
    </div>
  );
}

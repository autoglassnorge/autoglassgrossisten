import type {
  HandoffSummary,
  MatchExplanation,
  OrdremottakerResponse,
  QuoteDraft,
  ToolResult,
  UnifiedSearchToolData,
} from '@/api/ordremottaker';
import HandoffPanel from './HandoffPanel';
import MatchExplanationPanel from './MatchExplanationPanel';
import QuoteDraftCard from './QuoteDraftCard';

interface ToolResultsPanelProps {
  results?: OrdremottakerResponse['tool_results'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getSearchData(result: ToolResult): UnifiedSearchToolData | null {
  if (result.tool !== 'search' || !isRecord(result.data)) return null;
  return result.data as UnifiedSearchToolData;
}

function getQuoteDraft(result: ToolResult): QuoteDraft | null {
  if (result.tool !== 'buildQuote' || !isRecord(result.data)) return null;
  const draft = result.data as Partial<QuoteDraft>;
  if (!Array.isArray(draft.items) || typeof draft.total !== 'number') return null;
  return draft as QuoteDraft;
}

function getHandoffSummary(result: ToolResult): HandoffSummary | null {
  if (result.tool !== 'handoff' || !isRecord(result.data)) return null;
  const summary = result.data as Partial<HandoffSummary>;
  if (typeof summary.reason !== 'string' || typeof summary.summary !== 'string') return null;
  return summary as HandoffSummary;
}

function getMatchExplanation(result: ToolResult): MatchExplanation | null {
  const data = getSearchData(result);
  if (!data?.matchExplanation) return null;
  return data.matchExplanation;
}

export default function ToolResultsPanel({ results }: ToolResultsPanelProps) {
  if (!results || results.length === 0) return null;

  const explanations = results.map(getMatchExplanation).filter((item): item is MatchExplanation => item !== null);
  const quotes = results.map(getQuoteDraft).filter((item): item is QuoteDraft => item !== null);
  const handoffs = results.map(getHandoffSummary).filter((item): item is HandoffSummary => item !== null);
  const errors = results.filter((result) => !result.success && result.error);

  if (explanations.length === 0 && quotes.length === 0 && handoffs.length === 0 && errors.length === 0) {
    return null;
  }

  return (
    <div className="mb-4">
      {explanations.map((explanation) => (
        <MatchExplanationPanel
          key={`${explanation.layer}-${explanation.confidence}-${explanation.reasons.join('|')}`}
          explanation={explanation}
        />
      ))}
      {quotes.map((quote, index) => (
        <QuoteDraftCard key={`${quote.total}-${index}`} draft={quote} />
      ))}
      {handoffs.map((handoff, index) => (
        <HandoffPanel key={`${handoff.reason}-${index}`} summary={handoff} />
      ))}
      {errors.map((result) => (
        <div key={result.id} className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {result.error}
        </div>
      ))}
    </div>
  );
}

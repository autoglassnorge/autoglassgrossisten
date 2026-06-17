export interface ChatPageContext {
  path: string;
  current_query?: string;
  category?: string;
}

export interface ChatRequest {
  message: string | null;
  session_token?: string | null;
  page_context?: ChatPageContext;
  customer_id?: number | null;
  language?: string;
}

export type ChatEventType =
  | 'meta'
  | 'typing'
  | 'text'
  | 'products'
  | 'quick_replies'
  | 'tool_call'
  | 'handoff'
  | 'error'
  | 'done';

export interface ChatEvent {
  type: ChatEventType;
  data: Record<string, unknown>;
}

export interface SearchGlassParams {
  regnr?: string | null;
  vin?: string | null;
  eurocode?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  position?: string | null;
  equipment?: Record<string, boolean>;
}

export interface ExplainDifferencesParams {
  candidate_ids: number[];
}

export interface AskCustomerParams {
  question_key: string;
  question_text: string;
  options: { label: string; value: string }[];
}

export interface HandoverToHumanParams {
  reason: string;
  summary: string;
  preferred_contact?: 'chat' | 'phone' | 'email';
}

export type ChatToolCall =
  | { tool: 'searchGlass'; params: SearchGlassParams }
  | { tool: 'explainDifferences'; params: ExplainDifferencesParams }
  | { tool: 'askCustomer'; params: AskCustomerParams }
  | { tool: 'handoverToHuman'; params: HandoverToHumanParams };

export interface LlmResponseShape {
  tool_calls?: ChatToolCall[];
  message?: string;
  quick_replies?: { label: string; value: string }[];
}

export interface GlassSearchToolResult {
  ok: boolean;
  vehicle?: { make: string; model: string; year: number } | null;
  candidates: unknown[];
  confidence: number;
  reasons: string[];
}

/**
 * Professor Autoglass 2.0 — Tool execution engine (Fase 3A)
 * Slim scope: 4 tools (search, faq, buildQuote, handoff)
 * No explain/compare. No UNI Micro. No persistence.
 */

import type {
  Env,
  ToolCall,
  ToolResult,
  GlassRecord,
  AccessoryItem,
  QuoteDraft,
  MatchExplanation,
  HandoffSummary,
  UnifiedSearchResponse,
} from "../types";
import { handleUnifiedSearch } from "../handlers/unified-search";
import { searchFaq, isGreeting } from "./ordremottaker-knowledge";
import { buildQuoteDraft, buildQuoteDraftFromTopCandidate } from "./quote-draft";

// ── Tool Execution ──────────────────────────────────────────────────────────

/** Execute a single tool call and return a ToolResult */
export async function executeTool(
  toolCall: ToolCall,
  env: Env,
  ctx: ExecutionContext,
  sessionContext?: {
    vehicle?: { make: string; model: string; year: number };
    equipmentAnswers?: Record<string, string>;
    candidates?: GlassRecord[];
    accessories?: AccessoryItem[];
    messages?: Array<{ role: "user" | "ai"; content: string }>;
  }
): Promise<ToolResult> {
  switch (toolCall.tool) {
    case "search":
      return executeSearch(toolCall, env, ctx, sessionContext);
    case "faq":
      return executeFaq(toolCall);
    case "buildQuote":
      return executeBuildQuote(toolCall, sessionContext);
    case "handoff":
      return executeHandoff(toolCall, sessionContext);
    default:
      return {
        tool: toolCall.tool,
        id: toolCall.id,
        success: false,
        error: `Unknown tool: ${(toolCall as ToolCall).tool}`,
      };
  }
}

/** Execute search tool — delegates to handleUnifiedSearch */
async function executeSearch(
  toolCall: ToolCall,
  env: Env,
  ctx: ExecutionContext,
  sessionContext?: {
    vehicle?: { make: string; model: string; year: number };
    equipmentAnswers?: Record<string, string>;
  }
): Promise<ToolResult> {
  const params = toolCall.params as { input?: string; category?: string };
  const input = params.input || "";
  const category = params.category;

  if (!input) {
    return {
      tool: "search",
      id: toolCall.id,
      success: false,
      error: "Missing input parameter",
    };
  }

  try {
    const request = new Request("http://internal/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, category }),
    });

    const response = await handleUnifiedSearch(request, env, ctx);
    const searchResult = (await response.json()) as UnifiedSearchResponse;

    const matchExplanation: MatchExplanation | undefined = searchResult.ok
      ? {
          layer: searchResult.confidence.layer,
          layerName: getLayerName(searchResult.confidence.layer),
          confidence: searchResult.confidence.level,
          reasons: searchResult.confidence.reasons,
          vehicle: searchResult.vehicle
            ? {
                make: searchResult.vehicle.make || "",
                model: searchResult.vehicle.model || "",
                year: searchResult.vehicle.year || 0,
                regnr: searchResult.vehicle.regnr,
              }
            : undefined,
        }
      : undefined;

    return {
      tool: "search",
      id: toolCall.id,
      success: searchResult.ok,
      data: {
        searchResult,
        matchExplanation,
      },
      error: searchResult.error
        ? `${searchResult.error.code}: ${searchResult.error.message}`
        : undefined,
    };
  } catch (e) {
    return {
      tool: "search",
      id: toolCall.id,
      success: false,
      error: e instanceof Error ? e.message : "Search failed",
    };
  }
}

/**
 * Synthesize a search ToolResult from existing ordremottaker data.
 * Use this INSTEAD of executeSearch when the search has already been done
 * by the existing ordremottaker flow — avoids double lookup.
 */
export function synthesizeSearchToolResult(
  toolCall: ToolCall,
  candidates: GlassRecord[],
  vehicleInfo?: { make: string; model: string; year: number },
  confidence?: number
): ToolResult {
  const hasResults = candidates.length > 0;
  const level: 'exact' | 'high' | 'medium' | 'low' | 'none' = hasResults
    ? (confidence && confidence >= 0.7 ? 'high' : confidence && confidence >= 0.4 ? 'medium' : 'low')
    : 'none';

  const input = (toolCall.params as { input?: string }).input || '';
  // VIN = 17 chars; regnr otherwise
  const detectedType: import('../types').InputType = input.length === 17 ? 'vin' : 'regnr';

  const searchResult: UnifiedSearchResponse = {
    ok: hasResults,
    error: hasResults ? undefined : { code: 'NO_MATCH', message: 'Ingen glass funnet i katalogen' },
    input: {
      raw: input,
      detectedType,
      normalized: input,
    },
    vehicle: vehicleInfo
      ? {
          make: vehicleInfo.make,
          model: vehicleInfo.model,
          year: vehicleInfo.year,
        }
      : undefined,
    results: candidates.slice(0, 5).map((c) => ({
      id: c.id,
      eurocode: c.eurocode,
      brand: c.brand,
      model: c.model,
      category: c.category,
      description: c.description,
      price: c.price,
      stockStatus: c.stock_status,
      score: 1.0,
    })),
    confidence: {
      level,
      score: confidence || 0,
      layer: -1,
      reasons: hasResults ? ['Syntetisert fra eksisterende søk'] : ['Ingen treff i katalogen'],
    },
    nextActions: hasResults
      ? [{ action: 'select', label: 'Velg glass' }]
      : [{ action: 'clarify', label: 'Gi mer info' }],
  };

  const matchExplanation: MatchExplanation | undefined = hasResults
    ? {
        layer: -1,
        layerName: 'ground_truth',
        confidence: level,
        reasons: ['Syntetisert fra eksisterende ordremottaker-søk'],
        vehicle: vehicleInfo
          ? { make: vehicleInfo.make, model: vehicleInfo.model, year: vehicleInfo.year }
          : undefined,
      }
    : undefined;

  // success=true always — the tool executed correctly. no-match is a valid
  // search result (catalog has no glass), not a tool failure.
  return {
    tool: 'search',
    id: toolCall.id,
    success: true,
    data: {
      searchResult,
      matchExplanation,
    },
  };
}

/** Execute FAQ tool — delegates to searchFaq */
function executeFaq(toolCall: ToolCall): ToolResult {
  const params = toolCall.params as { query?: string };
  const query = params.query || "";

  if (!query) {
    return {
      tool: "faq",
      id: toolCall.id,
      success: false,
      error: "Missing query parameter",
    };
  }

  const result = searchFaq(query);

  return {
    tool: "faq",
    id: toolCall.id,
    success: !!result,
    data: result
      ? {
          articleId: result.article.id,
          question: result.article.question,
          answer: result.article.answer,
          score: result.score,
        }
      : null,
    error: result ? undefined : "No FAQ match found",
  };
}

/** Execute buildQuote tool — builds quote draft from session context */
function executeBuildQuote(
  toolCall: ToolCall,
  sessionContext?: {
    candidates?: GlassRecord[];
    accessories?: AccessoryItem[];
  }
): ToolResult {
  const params = toolCall.params as {
    items?: Array<{
      productId?: number;
      qty?: number;
      accessories?: Array<{ sku: string }>;
    }>;
  };

  // If no explicit items, use top candidate from session
  const candidates = sessionContext?.candidates || [];
  if (candidates.length === 0) {
    return {
      tool: "buildQuote",
      id: toolCall.id,
      success: false,
      error: "No candidates available in session",
    };
  }

  try {
    let quoteDraft: QuoteDraft;

    if (params.items && params.items.length > 0) {
      // Build from explicit items
      const quoteItems = params.items
        .map((item) => {
          const product = candidates.find((c) => c.id === item.productId);
          if (!product) return null;
          const itemAccessories =
            item.accessories
              ?.map((a) => {
                const acc = sessionContext?.accessories?.find(
                  (sa) => sa.sku === a.sku
                );
                return acc || null;
              })
              .filter((a): a is AccessoryItem => a !== null) || [];
          return { product, qty: item.qty || 1, accessories: itemAccessories };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (quoteItems.length === 0) {
        return {
          tool: "buildQuote",
          id: toolCall.id,
          success: false,
          error: "No valid products found for quote",
        };
      }

      quoteDraft = buildQuoteDraft(quoteItems);
    } else {
      // Auto-build from top candidate + session accessories
      const topCandidate = candidates[0];
      const sessionAccessories = sessionContext?.accessories || [];
      quoteDraft = buildQuoteDraftFromTopCandidate(
        topCandidate,
        sessionAccessories
      );
    }

    return {
      tool: "buildQuote",
      id: toolCall.id,
      success: true,
      data: quoteDraft,
    };
  } catch (e) {
    return {
      tool: "buildQuote",
      id: toolCall.id,
      success: false,
      error: e instanceof Error ? e.message : "Quote build failed",
    };
  }
}

/** Execute handoff tool — generate escalation summary */
function executeHandoff(
  toolCall: ToolCall,
  sessionContext?: {
    vehicle?: { make: string; model: string; year: number };
    messages?: Array<{ role: "user" | "ai"; content: string }>;
    candidates?: GlassRecord[];
    equipmentAnswers?: Record<string, string>;
  }
): ToolResult {
  const params = toolCall.params as {
    reason?: string;
    summary?: string;
  };

  const reason = (params.reason || "customer_request") as HandoffSummary["reason"];
  const summary =
    params.summary || generateAutoSummary(sessionContext);

  return {
    tool: "handoff",
    id: toolCall.id,
    success: true,
    data: {
      reason,
      summary,
      // sessionToken populated by caller when available
    } as unknown as HandoffSummary,
  };
}

// ── Tool Routing ────────────────────────────────────────────────────────────

/** Determine which tools to call based on NER results and session state */
export function routeTools(
  nerResult: {
    regnr?: string | null;
    vin?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    position?: string | null;
    intent?: string;
    adas?: boolean | null;
    rain_sensor?: boolean | null;
    heated?: boolean | null;
  },
  message: string,
  sessionContext?: {
    vehicle?: { make: string; model: string; year: number };
    candidates?: GlassRecord[];
    dialogueState?: string | null;
  }
): ToolCall[] {
  const tools: ToolCall[] = [];

  // Greeting / smalltalk — handled before any tool routing
  if (isGreeting(message)) {
    return tools; // empty array → caller produces greeting response directly
  }

  // Knowledge question (no regnr/VIN and intent is knowledge)
  if (
    nerResult.intent === "kunnskap" &&
    !nerResult.regnr &&
    !nerResult.vin
  ) {
    tools.push({
      tool: "faq",
      params: { query: message },
      id: crypto.randomUUID(),
    });
    return tools;
  }

  // User explicitly wants human
  const wantsHuman = /\b(snakk med|kontakt|menneske|agent|selger|ordremottaker|telefon)\b/i.test(
    message
  );
  if (wantsHuman) {
    tools.push({
      tool: "handoff",
      params: { reason: "customer_request", summary: "Bruker ba om å snakke med et menneske" },
      id: crypto.randomUUID(),
    });
    return tools;
  }

  // User wants quote and we have candidates
  const wantsQuote = /\b(tilbud|quote|bestill|ordre|legg i|send)\b/i.test(message);
  if (wantsQuote && sessionContext?.candidates && sessionContext.candidates.length > 0) {
    tools.push({
      tool: "buildQuote",
      params: {},
      id: crypto.randomUUID(),
    });
    return tools;
  }

  // Vehicle search (regnr, VIN, make+model+year, or text description)
  const hasVehicle =
    !!nerResult.regnr ||
    !!nerResult.vin ||
    (!!nerResult.make && !!nerResult.year) ||
    (!!nerResult.make && !!nerResult.model);

  if (hasVehicle) {
    let searchInput = "";
    if (nerResult.regnr) searchInput = nerResult.regnr;
    else if (nerResult.vin) searchInput = nerResult.vin;
    else if (nerResult.make && nerResult.year)
      searchInput = `${nerResult.make} ${nerResult.model || ""} ${nerResult.year}`;
    else searchInput = message;

    tools.push({
      tool: "search",
      params: {
        input: searchInput.trim(),
        category: nerResult.position || undefined,
      },
      id: crypto.randomUUID(),
    });
    return tools;
  }

  // Fallback: if user is in an active dialogue with candidates, try search on raw message
  if (sessionContext?.candidates && sessionContext.candidates.length > 0) {
    tools.push({
      tool: "faq",
      params: { query: message },
      id: crypto.randomUUID(),
    });
    return tools;
  }

  // No clear intent — handoff with clarification
  tools.push({
    tool: "handoff",
    params: {
      reason: "equipment_unclear",
      summary: "Kunne ikke tolke brukerens behov. Trenger mer informasjon.",
    },
    id: crypto.randomUUID(),
  });

  return tools;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getLayerName(layer: number): string {
  if (layer === -1) return "ground_truth";
  if (layer === 0) return "kType_exact";
  if (layer === 0.5) return "tecdoc_fallback";
  if (layer === 1) return "brand_model_year";
  if (layer === 2) return "kType_family";
  if (layer === 3) return "fuzzy";
  return "unknown";
}

function generateAutoSummary(
  sessionContext?: {
    vehicle?: { make: string; model: string; year: number };
    messages?: Array<{ role: "user" | "ai"; content: string }>;
    candidates?: GlassRecord[];
    equipmentAnswers?: Record<string, string>;
  }
): string {
  const parts: string[] = [];

  if (sessionContext?.vehicle) {
    parts.push(
      `Kjøretøy: ${sessionContext.vehicle.make} ${sessionContext.vehicle.model} (${sessionContext.vehicle.year})`
    );
  }

  if (sessionContext?.candidates && sessionContext.candidates.length > 0) {
    const top = sessionContext.candidates[0];
    parts.push(
      `Toppkandidat: ${top.eurocode || top.supplier_sku} — ${top.brand} ${top.model || ""}`
    );
  }

  const knownEquipment = sessionContext?.equipmentAnswers
    ? Object.entries(sessionContext.equipmentAnswers)
        .filter(([, v]) => v && v !== "vet_ikke")
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")
    : "";
  if (knownEquipment) {
    parts.push(`Kjent utstyr: ${knownEquipment}`);
  }

  if (parts.length === 0) {
    return "Ingen detaljer tilgjengelig fra samtalen.";
  }

  return parts.join(". ");
}

// ── Tool Response Generation (Fase 3A) ────────────────────────────────────

/**
 * Generate a human-readable AI response from tool execution results.
 * Template-based (not LLM) — fast, deterministic, no extra API cost.
 */
export function generateResponseFromToolResults(
  toolResults: ToolResult[],
  sessionContext?: {
    vehicle?: { make: string; model: string; year: number };
    candidates?: GlassRecord[];
  }
): string {
  const parts: string[] = [];
  const vehicle = sessionContext?.vehicle;
  const vehicleDesc = vehicle
    ? `${vehicle.make} ${vehicle.model} (${vehicle.year})`
    : "bilen din";

  for (const result of toolResults) {
    if (!result.success) {
      parts.push(`Beklager, noe gikk galt: ${result.error || "Ukjent feil"}.`);
      continue;
    }

    switch (result.tool) {
      case "search": {
        const data = result.data as {
          searchResult?: { ok: boolean; results?: Array<unknown>; error?: { message: string } };
        } | undefined;
        const searchResult = data?.searchResult;
        if (searchResult?.ok === false) {
          // No-match is a valid result — not a tool failure
          parts.push(`Jeg fant dessverre ingen glass som passer til ${vehicleDesc} i katalogen vår. Kan du dobbeltsjekke opplysningene, eller prøve med registreringsnummer?`);
        } else if (searchResult?.ok) {
          const count = searchResult.results?.length || 0;
          if (count > 0) {
            parts.push(`Jeg fant ${count} glass som passer til ${vehicleDesc}.`);
          } else {
            parts.push(`Jeg fant dessverre ingen glass som passer til ${vehicleDesc}. Kan du dobbeltsjekke opplysningene?`);
          }
        } else {
          parts.push(`Beklager, søket feilet: ${searchResult?.error?.message || "Ukjent feil"}.`);
        }
        break;
      }

      case "faq": {
        const data = result.data as { answer?: string } | null;
        if (data?.answer) {
          parts.push(data.answer);
        }
        break;
      }

      case "buildQuote": {
        const draft = result.data as QuoteDraft | undefined;
        if (draft) {
          const itemCount = draft.items.length;
          const total = draft.total;
          parts.push(
            `Her er tilbudskladden din: ${itemCount} produkt(er), total ${total.toLocaleString("no-NO")} kr.`
          );
        }
        break;
      }

      case "handoff": {
        const summary = result.data as HandoffSummary | undefined;
        if (summary) {
          parts.push("Jeg overfører deg nå til en av våre ordremottakere. Et øyeblikk...");
        }
        break;
      }
    }
  }

  if (parts.length === 0) {
    return "Jeg forstod ikke helt hva du mente. Kan du prøve å formulere det annerledes?";
  }

  return parts.join("\n\n");
}

/**
 * Determine OrdremottakerResponse status from tool results.
 */
export function determineStatusFromTools(
  toolResults: ToolResult[]
): "question" | "recommendation" | "order_ready" | "escalated" | "clarification" | "knowledge" {
  for (const result of toolResults) {
    if (!result.success) continue;
    switch (result.tool) {
      case "faq":
        return "knowledge";
      case "buildQuote":
        return "order_ready";
      case "handoff": {
        const data = result.data as HandoffSummary | undefined;
        if (data?.reason === "customer_request") return "escalated";
        return "clarification";
      }
      case "search": {
        const data = result.data as {
          searchResult?: { ok: boolean; results?: unknown[]; confidence?: { level: string } };
        } | undefined;
        const sr = data?.searchResult;
        if (
          sr?.ok &&
          sr.results &&
          sr.results.length > 0 &&
          sr.confidence?.level !== "none"
        ) {
          return "recommendation";
        }
        return "clarification";
      }
    }
  }
  return "clarification";
}

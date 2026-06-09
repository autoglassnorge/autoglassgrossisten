/**
 * Professor Autoglass 2.0 — JSON Schema for LLM structured output (Fase 3A)
 * Slim scope: 4 tools (search, faq, buildQuote, handoff)
 */

import type { ExtractedFields } from "./ordremottaker-llm-dialogue";

export interface ProfessorResponse {
  message: string;
  toolCalls?: ProfessorToolCall[];
  extracted?: ExtractedFields;
  confidence: number;
  quoteDraft?: unknown;
  handoffRequired?: boolean;
  nextAction?:
    | "ask_equipment"
    | "show_results"
    | "confirm_quote"
    | "ask_clarification"
    | "handoff";
}

export interface ProfessorToolCall {
  tool: "search" | "faq" | "buildQuote" | "handoff";
  params: Record<string, unknown>;
  id: string;
}

export const PROFESSOR_SCHEMA = {
  type: "object",
  properties: {
    message: { type: "string" },
    toolCalls: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tool: {
            type: "string",
            enum: ["search", "faq", "buildQuote", "handoff"],
          },
          params: { type: "object" },
          id: { type: "string" },
        },
        required: ["tool", "params", "id"],
      },
    },
    extracted: {
      type: "object",
      properties: {
        position: {
          type: ["string", "null"],
          enum: [
            "frontrute",
            "bakrute",
            "dørrute-fv",
            "dørrute-fh",
            "dørrute-bv",
            "dørrute-bh",
            "sideglass-fv",
            "sideglass-fh",
            "sideglass-bv",
            "sideglass-bh",
            "ventilrute",
            "annet",
            null,
          ],
        },
        adas: {
          type: ["string", "null"],
          enum: ["ja", "nei", "vet_ikke", null],
        },
        ldw: {
          type: ["string", "null"],
          enum: ["ja", "nei", "vet_ikke", null],
        },
        heated: {
          type: ["string", "null"],
          enum: ["ja", "nei", "vet_ikke", null],
        },
        heated_type: {
          type: ["string", "null"],
          enum: ["full", "camera", null],
        },
        rain_sensor: {
          type: ["string", "null"],
          enum: ["ja", "nei", "vet_ikke", null],
        },
        hud: {
          type: ["string", "null"],
          enum: ["ja", "nei", "vet_ikke", null],
        },
        antenna: {
          type: ["string", "null"],
          enum: ["ja", "nei", "vet_ikke", null],
        },
        coated: {
          type: ["string", "null"],
          enum: ["ja", "nei", "vet_ikke", null],
        },
        acoustic: {
          type: ["string", "null"],
          enum: ["ja", "nei", "vet_ikke", null],
        },
      },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    handoffRequired: { type: "boolean" },
    nextAction: {
      type: "string",
      enum: [
        "ask_equipment",
        "show_results",
        "confirm_quote",
        "ask_clarification",
        "handoff",
      ],
    },
  },
  required: ["message", "confidence"],
};

/**
 * Inject tool definitions into the LLM system prompt.
 */
export function buildToolDefinitionsText(): string {
  return `DU HAR TILGANG TIL FØLGENDE VERKTØY (tools):

1. search — Søk etter glass i katalogen
   Parametere: { "input": string, "category"?: string }
   Bruk når: brukeren oppgir regnr, VIN, eurocode, OEM, SKU, eller beskriver bilen
   Eksempel: { "tool": "search", "params": { "input": "SU18018", "category": "frontrute" } }

2. faq — Søk i kunnskapsbase
   Parametere: { "query": string }
   Bruk når: brukeren spør OM noe (hva er, hvordan, forskjell, garanti, etc.)
   Eksempel: { "tool": "faq", "params": { "query": "Hva er OEM?" } }

3. buildQuote — Bygg tilbudskladd
   Parametere: { "items": [{"productId": number, "qty": number, "accessories": [{"sku": string, "qty": number}]}] }
   Bruk når: brukeren vil ha tilbud/quote og vi har produkter i session
   Eksempel: { "tool": "buildQuote", "params": { "items": [{"productId": 123, "qty": 1}] } }

4. handoff — Eskaler til menneske
   Parametere: { "reason": string, "summary": string }
   Bruk når: ingen treff, lav confidence, bruker ber om menneske, eller du er usikker
   Eksempel: { "tool": "handoff", "params": { "reason": "no_match", "summary": "Bruker trenger frontrute til Tesla Model X 2022, ingen treff i katalog" } }

VIKTIGE REGLER:
- Kall ALLTID search først når brukeren trenger å finne glass
- Aldri gjett produkt — bruk search og tolke resultatet
- Hvis search gir confidence=none → handoff eller be om mer info
- Hvis search gir medium/low → still equipment-spørsmål
- Du kan kalle flere tools, men maks 3 per tur
- Returner KUN gyldig JSON med message, toolCalls, confidence, nextAction`;
}

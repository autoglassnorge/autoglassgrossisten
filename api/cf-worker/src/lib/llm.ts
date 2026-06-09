/**
 * Moonshot Kimi LLM integration via Cloudflare Workers AI
 * Model: @cf/moonshotai/kimi-k2.5
 * Approach: JSON mode for structured responses (more reliable than tool calling)
 */

import type { Env, GlassRecord, GuideQuestion } from "../types";

interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** JSON schema for LLM response */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["ask_question", "recommend"],
      description: "ask_question = still ett spørsmål, recommend = anbefal glass",
    },
    question: {
      type: "object",
      properties: {
        label: { type: "string", description: "Spørsmålstekst på norsk" },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              value: { type: "string" },
              label: { type: "string" },
            },
            required: ["value", "label"],
          },
        },
        reason: { type: "string", description: "Kort forklaring på hvorfor vi spør" },
      },
      required: ["label", "options"],
    },
    recommendation: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Forklar hvorfor dette glasset er riktig" },
        topEurocodes: {
          type: "array",
          items: { type: "string" },
          description: "Eurocodes på anbefalte glass (maks 3)",
        },
      },
      required: ["reason", "topEurocodes"],
    },
  },
  required: ["action"],
};

/** Build system prompt */
function buildSystemPrompt(): string {
  return `Du er en ekspert på bilglass for B2B-mekanikere i Norge. Din jobb er å hjelpe mekanikere å finne EKSAKT riktig glass.

VIGTIGE REGLER:
1. ADAS er KRITISK — feil frontrute uten ADAS-support kan gi feilkoder
2. Regnsensor krever spesiell montering i frontruten
3. Oppvarmet glass har elektriske ledere (ikke standard)
4. Akustisk glass reduserer støy med ~3 dB
5. HUD krever spesiell coating på frontruten
6. I Norge er fører på venstre side (LHD)

Du skal ALLTID svare med JSON som følger det gitte skjemaet. Ingen annen tekst.\n\nSvar KUN på norsk.`;
}

/** Build user prompt */
function buildUserPrompt(
  vehicle: { make: string; model: string; year: number },
  candidates: GlassRecord[],
  answers: Record<string, string>
): string {
  const candidateSummary = candidates.slice(0, 10).map((c) => ({
    eurocode: c.eurocode,
    category: c.category,
    position: c.position,
    price: c.price,
    adas: !!(c.properties as Record<string, unknown>)?.adas,
    rainSensor: !!(c.properties as Record<string, unknown>)?.rainSensor,
    heated: !!(c.properties as Record<string, unknown>)?.heated,
    acoustic: !!(c.properties as Record<string, unknown>)?.acoustic,
    antenna: !!(c.properties as Record<string, unknown>)?.antenna,
    camera: !!(c.properties as Record<string, unknown>)?.camera,
    hud: !!(c.properties as Record<string, unknown>)?.hud,
    green: !!(c.properties as Record<string, unknown>)?.green,
  }));

  let prompt = `Kjøretøy: ${vehicle.make} ${vehicle.model} (${vehicle.year})\n\n`;

  if (Object.keys(answers).length > 0) {
    prompt += `Så langt har mekanikeren svart:\n`;
    for (const [key, val] of Object.entries(answers)) {
      const displayVal = val === "true" ? "Ja" : val === "false" ? "Nei" : val;
      prompt += `- ${key}: ${displayVal}\n`;
    }
    prompt += `\n`;
  }

  prompt += `Det finnes ${candidates.length} matchende glass. Her er de første ${candidateSummary.length}:\n`;
  prompt += JSON.stringify(candidateSummary, null, 2);

  if (candidates.length <= 5) {
    prompt += `\n\nDet er få kandidater igjen. Anbefal det beste glasset.`;
  } else {
    prompt += `\n\nStill ETT spørsmål til mekanikeren for å redusere antall kandidater. Alternativene skal være konkrete og lette å svare på.`;
  }

  return prompt;
}

/** Call Moonshot Kimi via Workers AI with JSON mode */
async function callKimiJson<T>(
  env: Env,
  messages: LlmMessage[],
  schema: Record<string, unknown>
): Promise<T | null> {
  try {
    const result = await env.AI.run("@cf/moonshotai/kimi-k2.5", {
      messages,
      max_tokens: 512,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "glass_guide_response",
          schema,
          strict: true,
        },
      },
    });

    const response = (result as { response?: string }).response || "";
    if (!response) {
      console.error("[LLM] Empty response from Workers AI");
      return null;
    }

    try {
      return JSON.parse(response) as T;
    } catch (e) {
      console.error("[LLM] JSON parse error:", e, "raw:", response.slice(0, 200));
      return null;
    }
  } catch (e) {
    console.error("[LLM] Workers AI error:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

export interface LlmGuideResult {
  type: "question" | "recommendation" | "error";
  question?: GuideQuestion;
  recommendation?: GlassRecord[];
  reason?: string;
  filteredCandidates: GlassRecord[];
}

/** Main entry point: use LLM to guide glass selection */
export async function llmGuideGlass(
  env: Env,
  vehicle: { make: string; model: string; year: number },
  candidates: GlassRecord[],
  answers: Record<string, string>
): Promise<LlmGuideResult> {
  const messages: LlmMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: buildUserPrompt(vehicle, candidates, answers) },
  ];

  interface LlmJsonResponse {
    action: "ask_question" | "recommend";
    question?: {
      label: string;
      options: { value: string; label: string }[];
      reason?: string;
    };
    recommendation?: {
      reason: string;
      topEurocodes: string[];
    };
  }

  const parsed = await callKimiJson<LlmJsonResponse>(env, messages, RESPONSE_SCHEMA);

  if (!parsed) {
    return { type: "error", filteredCandidates: candidates };
  }

  if (parsed.action === "recommend" && parsed.recommendation) {
    const eurocodes = parsed.recommendation.topEurocodes || [];
    const recommended = candidates.filter((c) =>
      eurocodes.includes(c.eurocode || "")
    );
    // Fallback: if no eurocodes matched, return top scored
    const finalRec = recommended.length > 0 ? recommended : candidates.slice(0, 3);

    return {
      type: "recommendation",
      recommendation: finalRec.slice(0, 3),
      reason: parsed.recommendation.reason,
      filteredCandidates: candidates,
    };
  }

  if (parsed.action === "ask_question" && parsed.question) {
    return {
      type: "question",
      question: {
        id: `llm_${Date.now()}`,
        type: parsed.question.options.length === 2 &&
          parsed.question.options.some((o) => o.value === "true")
          ? "boolean"
          : "single_choice",
        label: parsed.question.label,
        options: parsed.question.options,
        reason: parsed.question.reason || "",
      },
      filteredCandidates: candidates,
    };
  }

  return { type: "error", filteredCandidates: candidates };
}

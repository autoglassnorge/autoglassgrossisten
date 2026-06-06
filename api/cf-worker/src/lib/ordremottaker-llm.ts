/**
 * Ordremottaker LLM module
 * Moonshot Kimi K2.5 via Cloudflare Workers AI
 * JSON schema mode for structured responses
 */

import type { Env } from "../types";

interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const NER_SCHEMA = {
  type: "object",
  properties: {
    make: { type: ["string", "null"] },
    model: { type: ["string", "null"] },
    year: { type: ["number", "null"] },
    regnr: { type: ["string", "null"] },
    vin: { type: ["string", "null"] },
    position: {
      type: ["string", "null"],
      enum: ["frontrute", "bakrute", "dørrute-frem", "dørrute-bak", "siderute", "annet", null],
    },
    adas: { type: ["boolean", "null"] },
    rain_sensor: { type: ["boolean", "null"] },
    heated: { type: ["boolean", "null"] },
    intent: {
      type: "string",
      enum: ["bestill", "prisforespørsel", "support", "uklart"],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: [
    "make",
    "model",
    "year",
    "regnr",
    "vin",
    "position",
    "adas",
    "rain_sensor",
    "heated",
    "intent",
    "confidence",
  ],
};

const DIALOGUE_SCHEMA = {
  type: "object",
  properties: {
    ai_response: { type: "string" },
    status: {
      type: "string",
      enum: ["question", "recommendation", "clarification"],
    },
    next_action: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["ai_response", "status", "next_action", "confidence"],
};

interface ExtractedVehicle {
  make: string | null;
  model: string | null;
  year: number | null;
  regnr: string | null;
  vin: string | null;
  position: "frontrute" | "bakrute" | "dørrute-frem" | "dørrute-bak" | "siderute" | "annet" | null;
  adas: boolean | null;
  rain_sensor: boolean | null;
  heated: boolean | null;
  intent: "bestill" | "prisforespørsel" | "support" | "uklart";
  confidence: number;
}

interface DialogueResult {
  ai_response: string;
  status: "question" | "recommendation" | "clarification";
  next_action: string | null;
  confidence: number;
}

/** Call Moonshot Kimi via Workers AI with JSON schema mode */
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
          name: "ordremottaker_response",
          schema,
          strict: true,
        },
      },
    });

    const response = (result as { response?: string }).response || "";
    if (!response) {
      console.error("[Ordremottaker-LLM] Empty response from Workers AI");
      return null;
    }

    try {
      return JSON.parse(response) as T;
    } catch (e) {
      console.error(
        "[Ordremottaker-LLM] JSON parse error:",
        e,
        "raw:",
        response.slice(0, 200)
      );
      return null;
    }
  } catch (e) {
    console.error(
      "[Ordremottaker-LLM] Workers AI error:",
      e instanceof Error ? e.message : String(e)
    );
    return null;
  }
}

/** Extract vehicle data from a Norwegian customer message */
export async function extractVehicleFromMessage(
  env: Env,
  message: string
): Promise<ExtractedVehicle | null> {
  const systemPrompt =
    `Du er en erfaren ordremottaker hos Autoglass AS med 30 års erfaring.\n` +
    `Les kundens melding og ekstraher følgende felter.\n` +
    `- make: bilmerke (f.eks. "Jaguar", "VW", "Audi")\n` +
    `- model: modell (f.eks. "E-Pace", "Transporter", "A4")\n` +
    `- year: årsmodell som tall\n` +
    `- regnr: norsk registreringsnummer (2 bokstaver + 4-5 tall)\n` +
    `- vin: 17-sifret understellsnummer\n` +
    `- position: glassposisjon\n` +
    `- adas: har bilen ADAS/kamera?\n` +
    `- rain_sensor: har bilen regnsensor?\n` +
    `- heated: har bilen oppvarmet frontrute?\n` +
    `- intent: hva vil kunden?\n` +
    `- confidence: 0.0-1.0 hvor sikker er du?\n` +
    `Svar KUN med JSON. Ingen forklaring.`;

  const messages: LlmMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: message },
  ];

  return callKimiJson<ExtractedVehicle>(env, messages, NER_SCHEMA);
}

interface DialogueContext {
  vehicle?: { make: string; model: string; year: number } | null;
  candidates?: unknown[] | null;
  confidence: number;
}

/** Generate AI dialogue response based on extracted vehicle and candidates */
export async function generateDialogue(
  env: Env,
  message: string,
  context: DialogueContext
): Promise<DialogueResult | null> {
  const vehicleStr = context.vehicle
    ? `${context.vehicle.make} ${context.vehicle.model} (${context.vehicle.year})`
    : "Ukjent";
  const candidateCount = context.candidates?.length ?? 0;
  const uncertainty = context.confidence < 0.7 ? "Høy" : "Lav";

  const systemPrompt =
    `Du er ordremottaker hos Autoglass AS. Du snakker norsk.\n` +
    `Hjelp B2B-kunder (verksteder) med å finne riktig bilglass.\n` +
    `REGLER:\n` +
    `- Hvis du har funnet glass: vis OEM og Aftermarket side om side (ikke sorter).\n` +
    `- Foreslå tilbehør: list, lim, klips.\n` +
    `- Avslutt med direkte link til handlekurv når alt er klart.\n` +
    `- Vær kort og konsis. Maks 3 setninger.\n` +
    `- Hvis usikker: still ETT spørsmål.\n` +
    `NÅVÆRENDE KONTEKST:\n` +
    `Kjøretøy: ${vehicleStr}\n` +
    `Kandidater: ${candidateCount} glass funnet\n` +
    `Usikkerhet: ${uncertainty}`;

  const messages: LlmMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: message },
  ];

  return callKimiJson<DialogueResult>(env, messages, DIALOGUE_SCHEMA);
}

/** Build checkout URL from cart items */
export function buildCartUrl(items: { sku: string; qty: number }[]): string {
  const params = new URLSearchParams();
  items.forEach((item, i) => {
    params.append(`sku${i}`, item.sku);
    params.append(`qty${i}`, String(item.qty));
  });
  return `/kasse?${params.toString()}`;
}

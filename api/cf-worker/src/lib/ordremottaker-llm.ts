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
      enum: ["bestill", "prisforespørsel", "support", "kunnskap", "uklart"],
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
  intent: "bestill" | "prisforespørsel" | "support" | "kunnskap" | "uklart";
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
    `Du er Professor Autoglass, en erfaren bilglass-spesialist hos Autoglass AS.\n` +
    `Autoglass AS er en B2B grossist — vi SELGER glass til verksteder, vi bytter IKKE glass selv.\n` +
    `Les kundens melding og ekstraher kjøretøydata.\n` +
    `\n` +
    `FELTER:\n` +
    `- make: bilmerke (Jaguar, VW, Audi, BMW, Mercedes, Toyota, etc.)\n` +
    `- model: modell (E-Pace, Transporter, A4, X5, C-Klasse, etc.)\n` +
    `- year: årsmodell som tall (f.eks. 2019)\n` +
    `- regnr: norsk regnr (AB12345 eller AB123456)\n` +
    `- vin: 17-tegns understellsnummer\n` +
    `- position: frontrute / bakrute / dørrute-frem / dørrute-bak / siderute / annet\n` +
    `- adas: true hvis ADAS, kamera, filskiftevarsel, eller lane assist nevnes\n` +
    `- rain_sensor: true hvis regnsensor eller automatisk vindusvisker nevnes\n` +
    `- heated: true hvis oppvarmet frontrute eller varme i ruta nevnes\n` +
    `- intent: bestill / prisforespørsel / support / kunnskap / uklart\n` +
    `- confidence: 0.0-1.0\n` +
    `\n` +
    `VIKTIGE REGLER FOR INTENT:\n` +
    `- "kunnskap" = kunden spør OM noe (hva er..., hvordan..., forskjellen på..., garanti, levering, priser, oem vs aftermarket, etc.)\n` +
    `- "bestill" = kunden vil BESTILLE/HA et glass (trenger, skal ha, bestille, etc.)\n` +
    `- "prisforespørsel" = kunden spør om PRIS på et SPESIFIKT glass\n` +
    `- "support" = kunden har et problem eller klage\n` +
    `\n` +
    `VIKTIGE REGLER FOR NER:\n` +
    `- "Jeg har en XC60" → make: "VOLVO", model: "XC60" (kjente modeller uten merke)\n` +
    `- "T5" alene er IKKE en modell, det er en motor\n` +
    `- "2020-modell" → year: 2020\n` +
    `- "ruta" = frontrute hvis ikke annet er spesifisert\n` +
    `- "siderute" = dørrute-frem hvis ikke side er spesifisert\n` +
    `\n` +
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

/** Generate AI dialogue response — uses TEXT mode for natural conversation */
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
    `Du er Professor Autoglass (Tomar), en erfaren bilglass-spesialist hos Autoglass AS.\n` +
    `Autoglass AS er en B2B grossist — vi SELGER glass til verksteder, vi bytter IKKE glass selv.\n` +
    `Du snakker med B2B-kunder: verksteder, mekanikere, bilglass-bedrifter.\n` +
    `\n` +
    `STIL:\n` +
    `- Kort og direkte. Maks 2 setninger for bestillinger, opptil 4 setninger for kunnskaps-spørsmål.\n` +
    `- Oppsummer det du har forstått, så still spørsmål eller vis resultater.\n` +
    `- Aldri "Beklager, jeg kunne ikke..." — si heller hva du trenger.\n` +
    `- Bruk naturlig norsk, ikke robotspråk.\n` +
    `- Vær hjelpsom og kunnskapsrik — du er eksperten på bilglass.\n` +
    `\n` +
    `KODEORDBOK (varenummer-suffikser):\n` +
    `- Farger: GN=grønn, GY=grå, GD=mørk grønn, GP=sotet grønn (privacy), GB=grønn-blå (GNBL, standard på US-biler), BL=blå, YP=sotet, CL/C=klar\n` +
    `- Features: CS=coated (EU), SOLAR=coated (US-biler), COLD=bakrute uten varmetråder, EL=varmetråder, M=regnsensor, ENC=innkapslet, CSL=coated+laminert, U=HUD, T=tollvisir, ANT=antenne, AKU=akustisk, LDW/HUD=ADAS, P=Privacy (men City Safety på Volvo), BP=mørk blå/privacy blå, LG=venstre/RG=høyre dørglass (BMW), siffer=generasjonsvariant\n` +
    `- Side (i beskrivelsen): VS=venstre, HS=høyre. Delt/todelt bakrute = egen vare per halvdel (venstre/høyre).\n` +
    `- Tilbehør: K=klips, PY=pyntelist, PYT=pyntelist topp, PYB=pyntelist bunn. USA CARS: W-prefiks-SKU-er (W1435GB).\n` +
    `\n` +
    `EKSEMPLER PÅ GODE SVAR (bestilling):\n` +
    `"Forstått — VW Transporter 2019, frontrute. Har bilen ADAS-kamera?"\n` +
    `"Bra. Da er dette ADAS-glasset du trenger. OEM til 4.850 kr, Pilkington til 3.200 kr."\n` +
    `"Hei! Jeg trenger merke, modell, år og hvilket glass for å hjelpe deg. Regnr er best."\n` +
    `\n` +
    `EKSEMPLER PÅ GODE SVAR (kunnskap):\n` +
    `"OEM er originalglass med bilmerkets logo. Aftermarket er samme kvalitet uten logo, 30-50% billigere. Begge deler fører vi."\n` +
    `"ADAS-kalibrering kreves ALLTID etter fronrutebytte på biler med kamera/sensor. Verkstedet ditt må prise det inn."\n` +
    `"Laminert glass (frontrute) har PVB-film som holder fragmentene fast. Herdet glass (side/bak) knuser i små biter. Aldri bruk herdet glass som frontrute."\n` +
    `\n` +
    `KONTEKST:\n` +
    `Kjøretøy: ${vehicleStr}\n` +
    `Glass funnet: ${candidateCount}\n` +
    `Usikkerhet: ${uncertainty}\n` +
    `\n` +
    `Svar kort og naturlig. Ikke bruk punktlister eller markdown.`;

  try {
    const result = await env.AI.run("@cf/moonshotai/kimi-k2.5", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      max_tokens: 256,
      temperature: 0.4,
    });

    const response = (result as { response?: string }).response || "";
    if (!response) return null;

    // Determine status from response content
    let status: DialogueResult["status"] = "clarification";
    if (candidateCount > 0 && !response.includes("?")) {
      status = "recommendation";
    } else if (candidateCount > 0 && response.includes("?")) {
      status = "question";
    }

    return {
      ai_response: response.trim(),
      status,
      next_action: null,
      confidence: context.confidence,
    };
  } catch (e) {
    console.error("[Dialogue] Error:", e);
    return null;
  }
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

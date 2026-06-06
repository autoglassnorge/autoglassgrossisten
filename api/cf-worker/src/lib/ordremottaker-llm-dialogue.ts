/**
 * LLM Dialogue Engine for Professor Autoglass
 * Builds rich context, calls Workers AI, parses structured response
 */

import type { Env } from "../types";
import type { SessionContext } from './ordremottaker-session';
import { decodeEurocode } from "./eurocode-decoder";

interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface Candidate {
  id?: number;
  eurocode?: string;
  articleNumber?: string;
  supplier_sku?: string;
  category?: string;
  brand?: string;
  model?: string;
  year_from?: number;
  year_to?: number;
  properties?: Record<string, unknown>;
  decoded_description?: string | null;
  [key: string]: unknown;
}

export interface ExtractedFields {
  position?: 'frontrute' | 'bakrute' | 'dørrute' | 'siderute';
  adas?: 'ja' | 'nei' | 'vet_ikke';
  ldw?: 'ja' | 'nei' | 'vet_ikke';
  heated?: 'ja' | 'nei' | 'vet_ikke';
  heated_type?: 'full' | 'camera';
  rain_sensor?: 'ja' | 'nei' | 'vet_ikke';
  hud?: 'ja' | 'nei' | 'vet_ikke';
  antenna?: 'ja' | 'nei' | 'vet_ikke';
  coated?: 'ja' | 'nei' | 'vet_ikke';
  acoustic?: 'ja' | 'nei' | 'vet_ikke';
}

export interface LlmDialogueResponse {
  message: string;
  action: 'ask_question' | 'extract_info' | 'show_results' | 'clarify' | 'confirm';
  extracted: ExtractedFields;
  confidence: number;
}

interface DialogueContext {
  candidates: Candidate[];
  history: Array<{ role: 'user' | 'ai'; content: string }>;
  extracted: Record<string, string>;
  vehicle: { make: string; model: string; year: number } | null;
}

const DIALOGUE_SCHEMA = {
  type: "object",
  properties: {
    message: { type: "string" },
    action: {
      type: "string",
      enum: ["ask_question", "extract_info", "show_results", "clarify", "confirm"],
    },
    extracted: {
      type: "object",
      properties: {
        position: { type: ["string", "null"], enum: ["frontrute", "bakrute", "dørrute", "siderute", null] },
        adas: { type: ["string", "null"], enum: ["ja", "nei", "vet_ikke", null] },
        ldw: { type: ["string", "null"], enum: ["ja", "nei", "vet_ikke", null] },
        heated: { type: ["string", "null"], enum: ["ja", "nei", "vet_ikke", null] },
        heated_type: { type: ["string", "null"], enum: ["full", "camera", null] },
        rain_sensor: { type: ["string", "null"], enum: ["ja", "nei", "vet_ikke", null] },
        hud: { type: ["string", "null"], enum: ["ja", "nei", "vet_ikke", null] },
        antenna: { type: ["string", "null"], enum: ["ja", "nei", "vet_ikke", null] },
        coated: { type: ["string", "null"], enum: ["ja", "nei", "vet_ikke", null] },
        acoustic: { type: ["string", "null"], enum: ["ja", "nei", "vet_ikke", null] },
      },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["message", "action", "extracted", "confidence"],
};

const COLOR_CODES_TEXT = `
GN=helfarget grønn, GY=grønn med grå skyggefelt, GNEL=grønn elektrisk (oppvarmet),
GB=grønn med blå skygge, BZ=bronse, BZB=bronse med blå skygge,
GG=grønn med grønn skygge, GD=mørk grønn, YP=sotet,
BL=blå, BB=blå med blå skygge, CL=klar`;

const FEATURE_CODES_TEXT = `
EL=varmetråder, M=regnsensor, ENC=innkapslet (vulkanisert list),
ANT=antenne, CS=coated, P=Privacy, H=oppvarmet,
Z=z-bøy, UV=UV-beskyttet, A=antenne, C=klar`;

function buildSystemPrompt(): string {
  return `Du er Professor Autoglass, en erfaren bilglass-ekspert med 30 års erfaring hos Autoglass AS.
Du hjelper B2B-kunder (verksteder, mekanikere, bilglass-montører) med ALT innen bilglass.

DIN KUNNSKAP OMFATTER:
- Identifisere riktig bilglass (regnr, VIN, eurocode, merke/modell)
- Tolke eurocode-koder og forklare farger/features
- Installasjonsteknikker og limtyper (f.eks. spesial-lim for oppvarmet glass)
- ADAS-kalibrering og kamera-justerte ruter
- Forsikring og erstatning (hvilke glass dekkes, egenandel)
- OEM vs aftermarket — kvalitetsforskjeller, når velge hva
- Lover og regler (krav til bilglass, trafikkreglene)
- Sesongtips (vinter: steinsprut, sommer: varmerefleksjon)
- Tilbehør: pyntelist, klips, tetningslist, kalibrering
- Glass-typer: laminert, herdet, akustisk, coated, HUD-kompatible
- Rådgivning ved usikkerhet — "Jeg tror dette er riktig, men sjekk med leverandør"

REGELVERK FOR BESTILLING:
1. ALLTID spør om posisjon først hvis ukjent (frontrute, bakrute, siderute, dørrute)
2. Deretter: se på kandidater, finn hva som skiller dem, spør NATURLIG
3. Bruk eurocode-koder for å forklare forskjeller
4. Vis ALDRI mer enn 5 kandidater
5. OEM-only: foretrekk OEM, marker aftermarket tydelig hvis ingen OEM finnes
6. Spør MINST mulig — hvis bare 1-3 kandidater etter filtrering, vis dem med en gang
7. "Vet ikke" er OK — ikke press brukeren
8. Vær vennlig, profesjonell og effektiv

EUROCODE-KODER DU KJENNER:
Farger: ${COLOR_CODES_TEXT}
Features: ${FEATURE_CODES_TEXT}
Posisjoner: FV=foran venstre, FH=foran høyre, BV=bak venstre, BH=bak høyre

SVAR ALLTID PÅ NORSK.
Returner ALLTID valid JSON i dette formatet:
{
  "message": "...",
  "action": "ask_question|extract_info|show_results|clarify|confirm",
  "extracted": { "position": "...", "heated": "...", ... },
  "confidence": 0.0-1.0
}

Gyldige actions:
- ask_question: Spør brukeren om noe spesifikt
- extract_info: Brukeren ga info, jeg skal lagre det
- show_results: Vis kandidater
- clarify: Be om mer informasjon
- confirm: Bekreft før visning`;
}

function buildUserPrompt(context: DialogueContext): string {
  const candidateDescriptions = context.candidates.slice(0, 10).map((c, i) => {
    const code = c.eurocode || c.articleNumber || c.supplier_sku || '';
    const decoded = code ? decodeEurocode(code) : null;
    const props = c.properties || {};
    const features: string[] = [];
    if (props.heated) features.push('oppvarmet');
    if (props.rainSensor) features.push('regnsensor');
    if (props.adas) features.push('ADAS');
    if (props.lane_assist) features.push('lane assist');
    if (props.hud) features.push('HUD');
    if (props.antenna) features.push('antenne');
    if (props.coated) features.push('coated');
    if (props.acoustic) features.push('akustisk');
    if (props.camera) features.push('kamera-varme');
    return `Kandidat ${i + 1}: ${code}${decoded ? ` (${decoded})` : ''}${features.length ? ` — ${features.join(', ')}` : ''} — ${c.brand || ''} ${c.model || ''}`;
  }).join('\n');

  const knownFields = Object.entries(context.extracted)
    .filter(([, v]) => v && v !== 'vet_ikke')
    .map(([k, v]) => `${k}=${v}`)
    .join(', ') || 'Ingenting ennå';

  const historyText = context.history.slice(-6).map(h => `${h.role}: ${h.content}`).join('\n');

  return `NÅVÆRENDE KANDIDATER (${context.candidates.length}):
${candidateDescriptions || 'Ingen kandidater funnet ennå'}

ALLEREDE KJENT: ${knownFields}

KJØRETØY: ${context.vehicle ? `${context.vehicle.make} ${context.vehicle.model} (${context.vehicle.year})` : 'Ukjent'}

SAMTALEHISTORIKK (siste 6 meldinger):
${historyText}

INSTRUKS: Analyser situasjonen. Hva vet du? Hva mangler? Hva er neste naturlige steg?
Returner JSON med message, action, extracted, confidence.`;
}

// Using @cf/moonshotai/moonshot-auto for faster responses and lower cost
// compared to kimi-k2.5, while maintaining good JSON schema adherence
/** Call Workers AI with JSON schema mode for dialogue */
async function callDialogueLlm(
  env: Env,
  context: DialogueContext
): Promise<LlmDialogueResponse | null> {
  try {
    const messages: LlmMessage[] = [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt(context) },
    ];

    const result = await env.AI.run("@cf/moonshotai/moonshot-auto", {
      messages,
      max_tokens: 512,
      temperature: 0.3,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "dialogue_response",
          schema: DIALOGUE_SCHEMA,
          strict: true,
        },
      },
    });

    const response = (result as { response?: string }).response || "";
    if (!response) {
      console.error("[DialogueEngine] Empty response from Workers AI");
      return null;
    }

    try {
      const parsed = JSON.parse(response) as LlmDialogueResponse;
      const validActions = ['ask_question', 'extract_info', 'show_results', 'clarify', 'confirm'];
      if (!validActions.includes(parsed.action)) {
        console.warn(`[DialogueEngine] Invalid action: ${parsed.action}, defaulting to clarify`);
        parsed.action = 'clarify';
      }
      return parsed;
    } catch (e) {
      console.error("[DialogueEngine] JSON parse error:", e, "raw:", response.slice(0, 200));
      return null;
    }
  } catch (e) {
    console.error("[DialogueEngine] Workers AI error:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Generate the next dialogue turn using LLM */
export async function generateDialogueTurn(
  env: Env,
  context: DialogueContext
): Promise<LlmDialogueResponse | null> {
  if (context.candidates.length === 0) {
    return null;
  }

  const response = await callDialogueLlm(env, context);
  if (!response) {
    return null;
  }

  console.log(`[DialogueEngine] action=${response.action}, confidence=${response.confidence}, extracted=${JSON.stringify(response.extracted)}`);
  return response;
}

/** Convert extracted fields to Record<string, string> for filterByEquipment */
export function normalizeExtracted(extracted: ExtractedFields): Record<string, string> {
  const result: Record<string, string> = {};
  if (extracted.position) result.position = extracted.position;
  if (extracted.adas) result.adas = extracted.adas;
  if (extracted.ldw) result.ldw = extracted.ldw;
  if (extracted.heated) result.heated = extracted.heated;
  if (extracted.heated_type) result.heated_type = extracted.heated_type;
  if (extracted.rain_sensor) result.rain_sensor = extracted.rain_sensor;
  if (extracted.hud) result.hud = extracted.hud;
  if (extracted.antenna) result.antenna = extracted.antenna;
  if (extracted.coated) result.coated = extracted.coated;
  if (extracted.acoustic) result.acoustic = extracted.acoustic;
  return result;
}

/** Determine dialogue state based on candidates and extracted fields */
export function determineDialogueState(
  candidates: Candidate[],
  extracted: Record<string, string>
): SessionContext['dialogueState'] {
  if (!extracted.position) {
    return 'needs_position';
  }
  if (candidates.length <= 3) {
    return 'ready_to_show';
  }
  return 'filtering';
}

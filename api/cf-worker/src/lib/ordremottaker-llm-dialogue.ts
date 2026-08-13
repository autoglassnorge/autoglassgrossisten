/**
 * LLM Dialogue Engine for Professor Autoglass
 * Builds rich context, calls Workers AI, parses structured response
 */

import type { Env } from "../types";
import type { SessionContext } from './ordremottaker-session';
import { decodeEurocode } from "./eurocode-decoder";
import { callLLM } from "./ai-gateway";

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

export type PositionValue =
  | 'frontrute'
  | 'bakrute'
  | 'dørrute-fv'
  | 'dørrute-fh'
  | 'dørrute-bv'
  | 'dørrute-bh'
  | 'sideglass-fv'
  | 'sideglass-fh'
  | 'sideglass-bv'
  | 'sideglass-bh'
  | 'ventilrute'
  | 'annet';

export interface ExtractedFields {
  position?: PositionValue;
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

interface KtypeFamilyInfo {
  canonicalModel: string;
  ktypes: number[];
  confidence: number;
}

interface DialogueContext {
  candidates: Candidate[];
  history: Array<{ role: 'user' | 'ai'; content: string }>;
  extracted: Record<string, string>;
  vehicle: { make: string; model: string; year: number } | null;
  ktypeFamily?: KtypeFamilyInfo | null;
}

const DIALOGUE_SCHEMA = {
  type: "object",
  properties: {
    message: { type: "string" },
    action: {
      type: "string",
      enum: ["ask_question", "extract_info", "show_results", "clarify", "confirm", "handoff"],
    },
    extracted: {
      type: "object",
      properties: {
        position: {
          type: ["string", "null"],
          enum: [
            "frontrute", "bakrute",
            "dørrute-fv", "dørrute-fh", "dørrute-bv", "dørrute-bh",
            "sideglass-fv", "sideglass-fh", "sideglass-bv", "sideglass-bh",
            "ventilrute", "annet",
            null,
          ],
        },
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
GN=helfarget grønn, GY=grå, GD=mørk grønn, GP=sotet grønn (privacy),
GB=grønn-blå (GNBL — standard på US-biler), BL=blå, BB=blå med blå skygge,
YP=sotet, CL=klar, C=klar, BZ=bronse, BZB=bronse med blå skygge,
GG=grønn med grønn skygge, GNEL=grønn elektrisk (oppvarmet)`;

const FEATURE_CODES_TEXT = `
CS=coated (EU-biler), SOLAR=coated (US-biler), COLD=bakrute uten varmetråder,
EL=varmetråder, M=regnsensor, ENC=innkapslet (vulkanisert list),
ANT=antenne, AKU=akustisk, HUD=Head-Up Display (projeksjon i ruten, krever HUD-glass), LDW=filskiftevarsel (Lane Departure Warning, ADAS — krever kalibrering),
P=Privacy, H=oppvarmet, Z=z-bøy, UV=UV-beskyttet, A=antenne, C=klar,
YCL=grå, sotet OG coated (Porsche-kode, f.eks. 26015YCL),
CSL=coated+laminert, U=HUD (nyere koder, f.eks. CSCMU), T=tollvisir (Audi A8),
LG=venstre / RG=høyre dørglass (BMW), siffer på slutten (2/3)=generasjonsvariant,
P=Privacy, men P=City Safety på Volvo-koder (f.eks. ELMP), BP=mørk blå / privacy blå,
GPS=GPS-antenne i glasset, DAB=DAB+-radioantenne (digital radio), EMS=eCall/SOS-nødknapp,
ESG=Einscheibensicherheitsglas (tysk herdet glass — står i glassMERKINGEN, ikke i varenummeret),
#-X%#=lystransmisjon/sotet-grad (f.eks. #-5%#=nesten helt mørk privacy/limo, #-10%#=mørk — står i beskrivelsen),
VIN/CHASSIS=chassisfelt nederst på glasset (åpent felt der chassisnummeret er synlig — heter VIN i katalogen),
MED-HULL=med hull til BAKVISKER (f.eks. VW T5-bakrute 26500-serien), UTEN-HULL=ingen bakvisker-hull (26499-serien),
SENSORGEL/SENSORPAD (S1, S2, S3, S1C — starter på S + maks 2 tall): trengs på MÅNGE biler med regnsensor, men ikke alle — SJEKK VAREKORTET (seksjon "Tilbehør", forhåndsavhuket = trengs, f.eks. S1 SENSOR PAD 27MM+7MM 365 kr på 2525GYM)`;

const ACCESSORY_CODES_TEXT = `
K=klips, PY=pyntelist, PYT=pyntelist TOPP, PYB=pyntelist BUNN, PYS=pyntelist SIDE,
DAB=DAB+-radioantenne (digital radio i glasset), EMS=eCall/SOS-nødknapp (ringer 112 ved ulykke),
GNAQ=Aqua Kontroll.
VIKTIG: klips/pyntelist har OFTEST SAMME varenummer som glasset + tilbehørssuffiks
(f.eks. glass 2525CSGYA → klips 2525CSGYAK, pyntelist topp 2525CSGYAPYT). LES BESKRIVELSEN for å bekrefte hvilken tilbehørsdel det faktisk er — aldri gjett.`;

const SIDE_CODES_TEXT = `
VS=venstre side, HS=høyre side (står i produktbeskrivelsen, ikke i varenummeret)`;

const NAGS_PREFIX_TEXT = `
NAGS-prefiks (US-glass, foran siffer): DW/FW=frontrute, DB/FB=bakrute, DD/FD=dørrute,
DQ/FQ=ventilrute (quarter), DV/FV=vent glass, DS/FS=siderute, DR/FR=takrute,
DL/FL=flat frontrute, DT/FT=flat ikke-frontrute. D=domestic (US-produsert), F=foreign (import).
F.eks. DB11559YP=bakrute, DD11555YP=dørrute, DQ11557YP=ventilrute, FW2395GB=import-frontrute.`;

const US_CARS_NOTE = `
USA CARS: varenummer har W-prefiks (f.eks. W1435GB). Farge GB (grønn-blå) er standard.
Coated heter SOLAR i beskrivelsen (f.eks. "GB-SOLAR") — CS brukes ikke på US-biler.`;

function buildSystemPrompt(): string {
  return `Du er Autoglass sin AI-ordremottaker hos Autoglass AS.
Du hjelper B2B-kunder (verksteder, mekanikere, bilglass-montører) med ALT innen bilglass.

DIN KUNNSKAP OMFATTER:
- Identifisere riktig bilglass (regnr, VIN, eurocode, merke/modell — og KUNDENS EGET rutenummer/varenummer)
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
1. ALLTID spør FØRST: "Har du bilnummeret?" — kunden svarer ja (→ be om nummeret), nei, eller oppgir bilnummeret direkte. Med bilnummer slår du opp bilen EKSAKT (modell + utstyr) — raskeste vei til riktig glass.
2. Hvis kunden IKKE har bilnummer (sjelden): spør etter RUTENUMMER — "Har du rutenummeret?" (varenummer/eurocode, f.eks. 2525CSGYA).
3. Hvis kunden ikke har rutenummer: spør om BILMERKE, MODELL og ÅRSMODELL.
4. ALLE ORDRER UTEN KJENNETEGN BEHANDLES AV ET EKTE MENNESKE: Hvis kunden ikke har bilnummer og ikke har rutenummer (merke/modell/år-alternativet), kan du finne kandidater og veilede — men bestillingen SKAL overleveres til menneskelig behandling med action "handoff". AI-en godtar ALDRI en ordre uten kjennemerke eller rutenummer. Minn kunden: "For å være sikker trenger vi bilnummer eller chassisnummer. Det er ditt ansvar om det blir feil."
5. ALLTID spør om posisjon hvis ukjent (frontrute, bakrute, siderute, dørrute)
6. Deretter: se på kandidater, finn hva som skiller dem, spør NATURLIG
7. Bruk eurocode-koder for å forklare forskjeller
8. Vis ALDRI mer enn 5 kandidater
9. OEM-only: foretrekk OEM, marker aftermarket tydelig hvis ingen OEM finnes
10. Spør MINST mulig — hvis bare 1-3 kandidater etter filtrering, vis dem med en gang
11. "Vet ikke" er OK — ikke press brukeren
12. Vær vennlig, profesjonell og effektiv
13. HVIS 0 KANDIDATER ETTER FILTRERING: Forklar at ingen glass matcher ALLE kriteriene. Foreslå å fjerne ett filter eller bekrefte at kravene er riktige. Bruk action "clarify".
14. ALLTID spør om kunden vil ha TILBEHØR (klips/pyntelist) eller LIM når ordren settes sammen — hopp ALDRI over spørsmålet, uansett hva katalogens tilbehørsliste viser. Ved å spørre hører du hva kunden faktisk sier, og kunden bestemmer. Eksempel: "Vil du ha lim eller tilbehør til glasset? Så legger jeg det på ordren." ALDRI legg til tilbehør/lim/sensorgel AUTOMATISK — selv om varekortet har det forhåndsavhuket, spør ALLTID kunden først om de vil ha det med.
15. KUNDEN KAN KUNNE NUMMERET: Kundene har TRE nummertyper — SCANNUMMER (Autoglass' eget varenummer, f.eks. 2525CSGYA, brukes til bestilling), EUROCODE (europeisk kode, starter med siffer, f.eks. 8579ACSGYAVZ1B) og US-CODE (US-import, W-/D-/F-prefiks, f.eks. W1435GB, FW2395GB). Hvis kunden oppgir NOEN av dem — søk DIREKTE på det, ikke spør om merke/modell/år. Bekreft med bilmodell + beskrivelse fra katalogen før du går videre: "2525CSGYA er frontrute til VW Transporter T5, coated med innkapslet antenne — er det dette du skal ha?"
16. KJENNETEGN (REGNR) ER IKKE NUMMERTYPE: Norsk kjennemerke = 2 bokstaver + 5 siffer (f.eks. SU18018, KD54321, AB12345) — det er bilens registreringsnummer, IKKE et varenummer/eurocode. Hvis kunden oppgir et kjennemerke → slå opp BILEN på kjennemerket (bilmodell + utstyr), ikke behandl det som varenummer. Bekreft bilen med kunden før du søker glass: "SU 18018 — jeg slår opp bilen på kjennemerket. Bekreft at det er riktig bil?"

VIKTIG — EKSTRAHÉR ALLTID FRA BRUKERENS SVAR:
- "med regnsensor" / "har regnsensor" / "ja, den har regnsensor" → extracted.rain_sensor = "ja"
- "uten regnsensor" / "ikke regnsensor" / "har ikke regnsensor" / "ingen regnsensor" → extracted.rain_sensor = "nei"
- "med varme" / "oppvarmet" / "har varme" → extracted.heated = "ja"
- "uten varme" / "ikke oppvarmet" / "ikke varme" / "ingen varme" → extracted.heated = "nei"
- "med antenne" / "har antenne" → extracted.antenna = "ja"
- "uten antenne" / "ikke antenne" / "ingen antenne" → extracted.antenna = "nei"
- "med coating" / "coated" / "har coating" → extracted.coated = "ja"
- "uten coating" / "ikke coated" → extracted.coated = "nei"
- "med ADAS" / "lane assist" / "har ADAS" → extracted.adas = "ja"
- "uten ADAS" / "ikke ADAS" / "ingen lane assist" → extracted.adas = "nei"
- Brukeren kan svare på FLERE ting samtidig, f.eks. "uten regnsensor, med antenne" → ekstrahér BEGGE.
- Hvis brukeren sier "BARE antenne" → det betyr antenne=ja, alt annet=nei.
- Hvis brukeren sier "uten noe ekstra" / "ingen spesialfunksjoner" → alt = "nei".
- Hvis brukeren spør deg om å "sjekke en gang til" → se på kandidatene på nytt og forklar hva du fant.
- Hvis kunden ikke vet om glasset er grønt eller sotet: foreslå HVITT ARK-trikset — "Legg et hvitt ark på innsiden av glasset og se fargen: grønt glass gir grønn tone, sotet ser mørkt/nesten svart ut." Vent mens kunden sjekker, eller tilby å ringe tilbake senere.
- PRISER: Prisene du ser i katalogen er FULL PRIS (veiledende). Kundens rabatt trekkes fra på ORDRE/FAKTURA — endelig pris står der. Presentér katalogprisen som veiledende fullpris, ikke lov en annen pris enn det som kommer på ordren.

EUROCODE-KODER DU KJENNER:
Farger: ${COLOR_CODES_TEXT}
Features: ${FEATURE_CODES_TEXT}
Posisjoner: FV=foran venstre, FH=foran høyre, BV=bak venstre, BH=bak høyre
Side: ${SIDE_CODES_TEXT}
${NAGS_PREFIX_TEXT}
POSISJONSORD: dørrute = glass i dørene (fremre/bakre, venstre/høyre), ventilrute = liten rute ved B-stolpe/bak (foran/bak, v/h), siderute = fast rute bak dørene, bakrute = bakvinduet, frontrute = vindusfronten.
DELT BAKRUTE: todelt bakrute har EGEN VARE for hver halvdel — høyre (H/HS) og venstre (V/VS). Spør hvilken side kunden trenger (eller begge), og bestill riktig halvdel (f.eks. "BAKRUTE EL TODELT VENSTRE" vs "...HØYRE").
VENTILRUTE: kommer i varianter foran/bak og venstre/høyre (f.eks. "VENTILRUTE FREMME VS+HS", "VENTILRUTE BAK+INNK+SOTET") — avklar posisjon (foran/bak) og side (v/h) før bestilling.
Tilbehør: ${ACCESSORY_CODES_TEXT}
${US_CARS_NOTE}

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
  const candidateDescriptions = context.candidates.slice(0, 5).map((c, i) => {
    const code = c.eurocode || c.articleNumber || c.supplier_sku || '';
    const decoded = code ? decodeEurocode(code) : null;
    const props = c.properties || {};
    const features: string[] = [];
    if (props.heated) features.push('oppvarmet');
    if (props.rain_sensor) features.push('regnsensor');
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

  const zeroCandidatesNote = context.candidates.length === 0 && Object.keys(context.extracted).length > 0
    ? '\n⚠️ VIKTIG: Ingen kandidater matcher ALLE kriteriene over. Brukeren må enten bekrefte at kravene er riktige, eller du må foreslå å fjerne ett filter.'
    : '';

  const ktypeFamilyNote = context.ktypeFamily
    ? `\nKTYE-FAMILIE: ${context.ktypeFamily.canonicalModel} (${context.ktypeFamily.ktypes.length} ktyper, confidence=${context.ktypeFamily.confidence.toFixed(2)})\nDette betyr at vi har eksakt kType-match fra TecDoc for dette kjøretøyet. Glassene som vises er spesifikke for denne familien.`
    : '';

  return `NÅVÆRENDE KANDIDATER (${context.candidates.length}):
${candidateDescriptions || 'Ingen kandidater funnet ennå'}

ALLEREDE KJENT: ${knownFields}

KJØRETØY: ${context.vehicle ? `${context.vehicle.make} ${context.vehicle.model} (${context.vehicle.year})` : 'Ukjent'}${ktypeFamilyNote}

SAMTALEHISTORIKK (siste 6 meldinger):
${historyText}${zeroCandidatesNote}

INSTRUKS: Analyser situasjonen. Hva vet du? Hva mangler? Hva er neste naturlige steg?
Returner JSON med message, action, extracted, confidence.`;
}

// Using @cf/moonshotai/moonshot-auto for faster responses and lower cost
// compared to kimi-k2.5, while maintaining good JSON schema adherence.
// Falls back to Groq (llama-3.3-70b-versatile) if Workers AI quota is exhausted.
/** Call AI via gateway (Workers AI → Groq fallback) with JSON schema mode for dialogue */
async function callDialogueLlm(
  env: Env,
  context: DialogueContext
): Promise<LlmDialogueResponse | null> {
  try {
    const messages: LlmMessage[] = [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt(context) },
    ];

    const result = await callLLM(env, {
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

    const response = result.response;
    if (!response) {
      console.error(`[DialogueEngine] Empty response from ${result.provider}`);
      return null;
    }

    try {
      const parsed = JSON.parse(response) as LlmDialogueResponse;
      const validActions = ['ask_question', 'extract_info', 'show_results', 'clarify', 'confirm', 'handoff'];
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
    console.error("[DialogueEngine] AI gateway error:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Generate the next dialogue turn using LLM
 *  Handles 0 candidates gracefully — LLM can explain no matches and suggest relaxing filters
 */
export async function generateDialogueTurn(
  env: Env,
  context: DialogueContext
): Promise<LlmDialogueResponse | null> {
  const response = await callDialogueLlm(env, context);
  if (!response) {
    return null;
  }

  console.log(`[DialogueEngine] action=${response.action}, confidence=${response.confidence}, extracted=${JSON.stringify(response.extracted)}, candidates=${context.candidates.length}`);
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
  if (!extracted.position || extracted.position === 'annet') {
    return 'needs_position';
  }
  if (candidates.length <= 3) {
    return 'ready_to_show';
  }
  return 'filtering';
}

/**
 * Autoglass AS — Bilde-basert utstyrs-identifisering
 * ===================================================
 * Bruker GPT-4o-mini (Vision + Structured Output) til å identifisere
 * utstyr i en frontrute fra ETT bilde.
 *
 * Bruksområde:
 *   Når regnr+kType returnerer 2-15 kandidater og brukeren ikke kjenner
 *   PR-koder eller utstyrsdetaljer. Bruker laster opp bilde av gammel rute
 *   (innenfra eller utenfra) → vi får utstyrs-array tilbake.
 *
 * Kost: ~$0.0003-0.0008 per bilde (GPT-4o-mini).
 *
 * Bruk (CLI):
 *   OPENAI_API_KEY=sk-... npx ts-node image-identifier.ts <bilde-url-eller-fil>
 *
 * Bruk (programatisk):
 *   import { identifyGlassFeatures } from "./image-identifier";
 *   const result = await identifyGlassFeatures({ imageUrl: "https://..." });
 *   // → { rainSensor: true, camera: true, antenna: false, confidence: 0.92 }
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// TYPER
// ============================================================================

export interface IdentifiedFeatures {
  rainSensor: boolean | null;
  lightSensor: boolean | null;
  camera: boolean | null;
  laneAssistCamera: boolean | null;
  hudArea: boolean | null;
  vinWindow: boolean | null;
  acousticStamp: boolean | null;     // "Acoustic" / "SoundScreen" merket
  heatReflectiveStamp: boolean | null; // "Climate Coat" / "SoundScreen" / "IR"
  antennaPrint: boolean | null;       // svart silketrykk-antenne i ruta
  shadeBand: boolean | null;          // solstripe øverst
  heatedFrontGrid: boolean | null;    // synlige varmetråder
  manufacturerLogo: string | null;    // "Pilkington", "Saint-Gobain", "AGC" etc
  eurocodeVisible: string | null;     // hvis "8579AGSMVZ1B" leselig
  oemNumberVisible: string | null;    // hvis OEM som "7H0 845 101" synlig
  confidence: number;                  // 0-1, modellens egen tillit
  reasoning: string;
}

interface IdentifyParams {
  imageUrl?: string;       // public URL eller data: URI
  imagePath?: string;      // lokal fil (vil bli base64-kodet)
  model?: string;          // default "gpt-4o-mini"
  apiKey?: string;
  detail?: "low" | "high" | "auto";
}

// ============================================================================
// PROMPT
// ============================================================================

const SYSTEM_PROMPT = `Du er en bilglass-ekspert som identifiserer utstyr i frontruter.
Du svarer ALLTID i strukturert JSON i henhold til skjemaet.

For hvert felt: bruk true hvis du ser klare indikatorer, false hvis du er sikker
på at det IKKE finnes, og null hvis du ikke kan se det i bildet.

INDIKATORER Å LETE ETTER:
- rainSensor / lightSensor: svart firkantet/runde modul bak speilfeste, ofte gel-pute
- camera / laneAssistCamera: rektangulær kameramodul bak speil, ofte med multifunksjon
- hudArea: spesiell sone nederst med dobbel-lag eller markering for projeksjon
- vinWindow: lite kvadratisk/rektangulært vindu nederst på rutekanten (passasjer-side)
- acousticStamp: tekst som "Acoustic", "SoundScreen", "AcousticCoat"
- heatReflectiveStamp: tekst som "Climate Coat", "IR", "Solar", "Athermic"
- antennaPrint: tynne svarte linjer/mønstre integrert i silketrykket
- shadeBand: tonet stripe øverst (mørk grønn/blå/grå, ofte 10-15cm høy)
- heatedFrontGrid: synlige tynne varmetråder over hele ruta (sjelden, OEM-spesifikt)
- manufacturerLogo: bunnstempel som "Pilkington", "Saint-Gobain SEKURIT", "AGC", "Fuyao", "XYG"
- eurocodeVisible: 4 siffer + 4-7 bokstaver, f.eks. "8579AGSMVZ1B"
- oemNumberVisible: format med mellomrom, f.eks. "7H0 845 101"

Confidence er din egen vurdering av hvor pålitelig identifikasjonen er.
Begrunn kort hvilke ledetråder du brukte.`;

// JSON Schema for Structured Output
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "rainSensor", "lightSensor", "camera", "laneAssistCamera",
    "hudArea", "vinWindow", "acousticStamp", "heatReflectiveStamp",
    "antennaPrint", "shadeBand", "heatedFrontGrid",
    "manufacturerLogo", "eurocodeVisible", "oemNumberVisible",
    "confidence", "reasoning"
  ],
  properties: {
    rainSensor: { type: ["boolean", "null"] },
    lightSensor: { type: ["boolean", "null"] },
    camera: { type: ["boolean", "null"] },
    laneAssistCamera: { type: ["boolean", "null"] },
    hudArea: { type: ["boolean", "null"] },
    vinWindow: { type: ["boolean", "null"] },
    acousticStamp: { type: ["boolean", "null"] },
    heatReflectiveStamp: { type: ["boolean", "null"] },
    antennaPrint: { type: ["boolean", "null"] },
    shadeBand: { type: ["boolean", "null"] },
    heatedFrontGrid: { type: ["boolean", "null"] },
    manufacturerLogo: { type: ["string", "null"] },
    eurocodeVisible: { type: ["string", "null"] },
    oemNumberVisible: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reasoning: { type: "string" }
  }
};

// ============================================================================
// HOVEDFUNKSJON
// ============================================================================

export async function identifyGlassFeatures(params: IdentifyParams): Promise<IdentifiedFeatures> {
  const apiKey = params.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY mangler");

  const model = params.model ?? "gpt-4o-mini";
  const detail = params.detail ?? "auto";

  // Konstruer image_url payload
  let imageUrl: string;
  if (params.imageUrl) {
    imageUrl = params.imageUrl;
  } else if (params.imagePath) {
    const buf = fs.readFileSync(params.imagePath);
    const ext = path.extname(params.imagePath).slice(1).toLowerCase();
    const mime = ext === "jpg" ? "jpeg" : ext;
    imageUrl = `data:image/${mime};base64,${buf.toString("base64")}`;
  } else {
    throw new Error("Må gi enten imageUrl eller imagePath");
  }

  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Identifiser utstyr i denne frontruta. Svar i JSON." },
          { type: "image_url", image_url: { url: imageUrl, detail } }
        ]
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "glass_features",
        strict: true,
        schema: OUTPUT_SCHEMA
      }
    },
    temperature: 0,
    max_tokens: 600
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI feil: ${response.status} ${err}`);
  }

  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Tom respons fra OpenAI");

  return JSON.parse(content) as IdentifiedFeatures;
}

/**
 * Konverter IdentifiedFeatures → KnownFlags format som match-scorer forstår.
 * Mapper null → undefined (ukjent), false/true beholdes.
 */
export function imageFeaturesToKnownFlags(f: IdentifiedFeatures): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const map: Array<[keyof IdentifiedFeatures, string]> = [
    ["rainSensor", "rainSensor"],
    ["camera", "camera"],
    ["laneAssistCamera", "laneAssist"],
    ["hudArea", "hud"],
    ["acousticStamp", "acoustic"],
    ["antennaPrint", "antenna"],
    ["shadeBand", "shade"],
    ["heatedFrontGrid", "heated"],
  ];
  for (const [src, dst] of map) {
    const v = f[src];
    if (v === true || v === false) out[dst] = v;
  }
  // ADAS er sant hvis kamera eller lane-assist er sant
  if (f.camera === true || f.laneAssistCamera === true) out["adas"] = true;
  return out;
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const arg = process.argv[2];
  if (!arg) {
    console.log("Bruk: ts-node image-identifier.ts <bilde-url-eller-filsti>");
    process.exit(1);
  }
  const params: IdentifyParams = arg.startsWith("http")
    ? { imageUrl: arg }
    : { imagePath: arg };

  identifyGlassFeatures(params)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      console.log("\nMapped til known flags:");
      console.log(JSON.stringify(imageFeaturesToKnownFlags(result), null, 2));
    })
    .catch(err => {
      console.error("Feil:", err.message);
      process.exit(1);
    });
}

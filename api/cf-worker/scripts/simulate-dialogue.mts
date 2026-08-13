/**
 * SIMULERING 2: Ny kunde-samtale — kunde beskriver bilen (VW Transporter T6)
 * Tester: AI spør om utstyr ETT om gangen (aldri antar) + kodeordbok (AKU/SENS/ELEK)
 *         + tilbehør/lim-spørsmål med "nei"-svar.
 *
 * Kjøring:  npx tsx scripts/simulate-dialogue.mts   (fra api/cf-worker/)
 * Nøkkel:   DEEPSEEK_API_KEY leses fra ~/.hermes/.env
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { generateDialogueTurn } from "../src/lib/ordremottaker-llm-dialogue.js";

// --- Hent DEEPSEEK_API_KEY fra ~/.hermes/.env (uten å printe den) ---
const envFile = readFileSync(join(homedir(), ".hermes", ".env"), "utf-8");
const match = envFile.match(/^DEEPSEEK_API_KEY=(.+)$/m);
if (!match) throw new Error("DEEPSEEK_API_KEY ikke funnet i ~/.hermes/.env");
const DEEPSEEK_API_KEY = match[1].trim();

const env = {
  DEEPSEEK_API_KEY,
  GROQ_API_KEY: undefined,
  AI: {
    run: async () => {
      throw new Error("Workers AI ikke tilgjengelig lokalt");
    },
  },
} as any;

// --- Ekte kandidater fra katalogen (VW Transporter T6 2016-) ---
const candidates = [
  {
    articleNumber: "3393GN",
    eurocode: "8579GNVZ1B",
    brand: "VW",
    model: "Transporter T6 2016-",
    properties: { acoustic: false, rain_sensor: false, heated: false },
    price: 9175,
    stock: "Oslo",
  },
  {
    articleNumber: "3393GNM",
    eurocode: "8579GNMVZ1B",
    brand: "VW",
    model: "Transporter T6 2016-",
    properties: { acoustic: true, rain_sensor: true, heated: false },
    price: 9455,
    stock: "Oslo",
  },
  {
    articleNumber: "3393GNELM",
    eurocode: "8579GNELMVZ1B",
    brand: "VW",
    model: "Transporter T6 2016-",
    properties: { acoustic: true, rain_sensor: true, heated: true },
    price: 16720,
    stock: "Oslo",
  },
];

interface Turn {
  role: "user" | "ai";
  content: string;
}

const history: Turn[] = [];
let extracted: Record<string, string> = { position: "frontrute" };
let activeCandidates = candidates;

function contextFor(customerMsg: string) {
  return {
    candidates: activeCandidates,
    history: [...history, { role: "user" as const, content: customerMsg }],
    extracted,
    vehicle: { make: "VW", model: "Transporter", year: 2018 },
    ktypeFamily: null,
  };
}

async function turn(customerMsg: string) {
  console.log(`\n🧑 KUNDE: ${customerMsg}`);
  const ctx = contextFor(customerMsg);
  const res = await generateDialogueTurn(env, ctx);
  if (!res) {
    console.log("⚠️ Ingen respons (LLM-feil)");
    return;
  }
  const msg = (res as any).message ?? JSON.stringify(res);
  console.log(`🤖 PROFESSOR AUTOGLASS (${(res as any).action}): ${msg}`);
  history.push({ role: "user", content: customerMsg });
  history.push({ role: "ai", content: msg });

  // Simuler prod-filtering basert på kundens utsagn
  const low = customerMsg.toLowerCase();
  if (low.includes("regnsensor") || low.includes("viskere")) {
    extracted = { ...extracted, rain_sensor: "ja" };
    activeCandidates = activeCandidates.filter(
      (c: any) => c.properties.rain_sensor
    );
  }
  if (low.includes("ikke oppvarmet") || low.includes("uten varme")) {
    extracted = { ...extracted, heated: "nei" };
    activeCandidates = activeCandidates.filter(
      (c: any) => !c.properties.heated
    );
  }
  if (low.includes("ikke regnsensor") || low.includes("uten regnsensor")) {
    extracted = { ...extracted, rain_sensor: "nei" };
    activeCandidates = activeCandidates.filter(
      (c: any) => !c.properties.rain_sensor
    );
  }
}

async function main() {
  console.log("══════════════════════════════════════════════════");
  console.log("  SIMULERT NY SAMTALE #2 — VW Transporter T6");
  console.log("══════════════════════════════════════════════════");

  // Tur 1: Kunde beskriver bilen, ingen numre (test: AI spør, antar IKKE utstyr)
  await turn("Hei, jeg trenger ny frontrute til en VW Transporter 2018");

  // Tur 2: Kunden svarer på AI-spørsmålet
  await turn("Den har regnsensor og automatiske viskere, men ikke oppvarmet");

  // Tur 3: Bekreftelse av glass
  await turn("Ja, det stemmer");

  // Tur 4: Tilbehør/lim — kunden svarer NEI
  await turn("Nei, bare glasset");

  console.log("\n══════════════════════════════════════════════════");
  console.log("  SIMULERING FERDIG");
  console.log("══════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error("Feil:", e);
  process.exit(1);
});

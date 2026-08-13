/**
 * SIMULERING: Ny kunde-samtale mot ordremottakeren (generateDialogueTurn)
 * Bruker DeepSeek direkte (samme gateway som prod: DeepSeek → Workers AI → Groq).
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

// --- Ekte kandidater fra katalogen (VW Transporter/Caravelle T5 2003-) ---
const candidates = [
  {
    articleNumber: "2525CSGYA",
    eurocode: "8579ACSGYAVZ1B",
    brand: "VW",
    model: "Transporter/Caravelle T5 2003-",
    properties: { coated: true, antenna: true },
    price: 14045,
    stock: "Oslo",
  },
  {
    articleNumber: "2525GYA",
    eurocode: "8579AGYAVZ1B",
    brand: "VW",
    model: "Transporter/Caravelle T5 2003-",
    properties: { antenna: true },
    price: 9980,
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
    vehicle: { make: "VW", model: "Transporter", year: 2008 },
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

  // Simuler prod-filtering: kunden bekreftet 2525CSGYA → kun coated-kandidat igjen
  if (customerMsg.toLowerCase().includes("2525csgya")) {
    extracted = { ...extracted, coated: "ja", antenna: "ja" };
    activeCandidates = activeCandidates.filter(
      (c: any) => c.articleNumber === "2525CSGYA"
    );
  }
}

async function main() {
  console.log("══════════════════════════════════════════════════");
  console.log("  SIMULERT NY SAMTALE — ordremottaker (DeepSeek)");
  console.log("══════════════════════════════════════════════════");

  // Tur 1: Kunden oppgir scannummer DIREKTE (test: punkt 11 — nummer-gjenkjenning)
  await turn("Hei, jeg skal ha 2525CSGYA");

  // Tur 2: Bekreftelse
  await turn("Ja, det stemmer. 2525CSGYA er riktig rute");

  // Tur 3: Tilbehør/lim-spørsmål (test: punkt 10 — ALLTID spørre)
  await turn("Ja, ta med lim");

  console.log("\n══════════════════════════════════════════════════");
  console.log("  SIMULERING FERDIG");
  console.log("══════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error("Feil:", e);
  process.exit(1);
});

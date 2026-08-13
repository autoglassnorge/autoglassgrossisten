/**
 * SIMULERING 3: BATCH — 90 kunde-samtaler (50 frontrute, 20 bakrute, 20 dør/siderute)
 * ~30% av meldingene har skrivefeil/dårlig norsk (dialekt, slurv, manglende tegnsetting).
 *
 * Hver melding er FØRSTE melding i en samtale → ett AI-svar per samtale.
 * Resultat: results/simulation-90.json + oppsummeringsstatistikk i stdout.
 *
 * Kjøring:  npx tsx scripts/simulate-batch.mts   (fra api/cf-worker/)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { generateDialogueTurn } from "../src/lib/ordremottaker-llm-dialogue.js";

const envFile = readFileSync(join(homedir(), ".hermes", ".env"), "utf-8");
const m = envFile.match(/^DEEPSEEK_API_KEY=(.+)$/m);
if (!m) throw new Error("DEEPSEEK_API_KEY ikke funnet i ~/.hermes/.env");

const env = {
  DEEPSEEK_API_KEY: m[1].trim(),
  GROQ_API_KEY: undefined,
  AI: { run: async () => { throw new Error("Workers AI ikke tilgjengelig lokalt"); } },
} as any;

// ── Ekte kandidater fra katalogen ──────────────────────────────────────────
const T5T6 = [
  { articleNumber: "2525CSGYA", eurocode: "8579ACSGYAVZ1B", brand: "VW", model: "Transporter/Caravelle T5 2003-", properties: { coated: true, antenna: true }, price: 14045, stock: "Oslo" },
  { articleNumber: "2525GYA", eurocode: "8579AGYAVZ1B", brand: "VW", model: "Transporter/Caravelle T5 2003-", properties: { antenna: true }, price: 9980, stock: "Oslo" },
  { articleNumber: "3393GN", eurocode: "8579GNVZ1B", brand: "VW", model: "Transporter T6 2016-", properties: {}, price: 9175, stock: "Oslo" },
  { articleNumber: "3393GNM", eurocode: "8579GNMVZ1B", brand: "VW", model: "Transporter T6 2016-", properties: { acoustic: true, rain_sensor: true }, price: 9455, stock: "Oslo" },
  { articleNumber: "3393GNELM", eurocode: "8579GNELMVZ1B", brand: "VW", model: "Transporter T6 2016-", properties: { acoustic: true, rain_sensor: true, heated: true }, price: 16720, stock: "Oslo" },
];

const BAKRUTE = [
  { articleNumber: "8761GN", eurocode: "8761GN", brand: "BMW", model: "3-serie E30 83-90", properties: { heated: true }, price: 4615, stock: "Oslo" },
  { articleNumber: "29588GN", eurocode: "29588GN", brand: "MINI", model: "Cooper Coupe 11-", properties: { heated: true }, price: 6405, stock: "Oslo" },
  { articleNumber: "29588YP", eurocode: "29588YP", brand: "MINI", model: "Cooper Coupe 11-", properties: { heated: true }, price: 6705, stock: "Oslo" },
];

const DOR = [
  { articleNumber: "2466RGST2FD", eurocode: "2466RGST2FD", brand: "MINI", model: "Cooper Cabriolet 11-", properties: {}, price: 2340, stock: "Oslo" },
  { articleNumber: "2466LGST2FD", eurocode: "2466LGST2FD", brand: "MINI", model: "Cooper Cabriolet 11-", properties: {}, price: 2340, stock: "Oslo" },
];

const SIDE = [
  { articleNumber: "29591GN", eurocode: "29591GN", brand: "MINI", model: "Cooper Coupe 11-", properties: {}, price: 3035, stock: "Oslo" },
  { articleNumber: "29591YP", eurocode: "29591YP", brand: "MINI", model: "Cooper Coupe 11-", properties: {}, price: 2910, stock: "Oslo" },
  { articleNumber: "27063GN", eurocode: "27063GN", brand: "MINI", model: "Cooper Cabriolet 04-", properties: {}, price: 2865, stock: "Oslo" },
];

type Cat = "frontrute" | "bakrute" | "dorside";
interface Msg { msg: string; cat: Cat; vehicle: string | null; candidates: any[]; flags?: string[]; }
// flags: nummer (kunden oppgir nummer), feil (skrivefeil/dårlig norsk), antatt-utstyr (AI bør IKKE anta)

const VW_T5 = "VW Transporter 2008";
const VW_T6 = "VW Transporter 2018";
const MINI = "Mini Cooper 2014";
const BMW3 = "BMW 3-serie 1989";

// ── 90 meldinger ────────────────────────────────────────────────────────────
const MESSAGES: Msg[] = [];

// == FRONTRUTE (50) ==
const front: [string, string | null, string[]?][] = [
  // korrekt norsk, typiske henvendelser
  ["Hei, jeg trenger ny frontrute til en VW Transporter 2008-modell", VW_T5],
  ["God morgen. Frontruta på min VW Transporter 2018 har fått en steinsprut. Hva koster ny rute?", VW_T6],
  ["Hei, jeg skal ha frontrute til en VW Transporter 2008", VW_T5],
  ["Trenger pris på frontrute til VW Transporter 2018 med regnsensor", VW_T6],
  ["Hei! Frontrute til VW Transporter 2008, den har antenne", VW_T5],
  ["Jeg trenger en ny frontrute. Bilen er en VW Transporter fra 2018, med kamera og regnsensor", VW_T6],
  ["Hei, hva koster frontrute til VW Transporter 2018?", VW_T6],
  ["Frontrute til VW Transporter 2008 takk, helst coated", VW_T5],
  ["Vi har en VW Transporter 2018 inne hos oss som trenger ny frontrute med regnsensor", VW_T6],
  ["Hei. Kan du sende meg pris på frontrute til en VW Transporter 2008?", VW_T5],
  ["Hei, frontrute til en 2008 VW Transporter med antenne og coating", VW_T5],
  ["Trenger frontrute til VW Transporter 2018. Har den regnsensor, må jeg ha spesialglass da?", VW_T6],
  ["Hei! Jeg lurer på om dere har frontrute til VW Transporter 2008 på lager?", VW_T5],
  ["Hei, jeg skal bestille frontrute til en VW Transporter 2018", VW_T6],
  ["Hei, vi trenger frontrute til VW Transporter 2008, er det Oslo-lager?", VW_T5],
  ["Hei! Jeg har en steinsprut i frontruta på min VW Transporter 2018, kan du hjelpe meg?", VW_T6],
  ["Hei, kan du sjekke pris og lager på frontrute til VW Transporter 2008?", VW_T5],
  ["God dag, frontrute til VW Transporter 2018 ønskes. Hva finnes?", VW_T6],
  ["Hei, jeg trenger frontrute til en 2008 VW Transporter. Skal bruke den i vinter, trenger noe som tåler litt", VW_T5],
  ["Hei! Frontrute til VW Transporter 2018 med varme i ruta", VW_T6],
  ["Hei, hvilken frontrute passer til VW Transporter 2008?", VW_T5],
  // nummer-meldinger (test punkt 11)
  ["Hei, jeg skal ha 2525CSGYA", VW_T5, ["nummer"]],
  ["2525CSGYA takk", VW_T5, ["nummer"]],
  ["Hei! Vi skal ha 2525GYA til en VW", VW_T5, ["nummer"]],
  ["Jeg skal bestille 2525CSGYA. Er den på lager?", VW_T5, ["nummer"]],
  ["Har dere 2525GYA? Det er frontrute til Transporter", VW_T5, ["nummer"]],
  // regnr
  ["Hei, jeg trenger ny frontrute. Regnr er KD 54321", null],
  ["Hei, kan du finne riktig frontrute? Regnr AB12345", null],
  ["Frontrute, regnr EL98765 takk", null],
  // skrivefeil / dårlig norsk (~30%)
  ["hei trenger frnotute til vw transporter 2008", VW_T5, ["feil"]],
  ["frontrute vw trasporter 2018 regnsnsor?", VW_T6, ["feil"]],
  ["hei jeg trege ny rute til min transporter 2008 med anteene", VW_T5, ["feil"]],
  ["e det mulig å få frontrute til t5 2008 model??", VW_T5, ["feil"]],
  ["Hei trenger frontrute vw t6 2018 den har regn sensor og er opvarmet tror jeg", VW_T6, ["feil"]],
  ["hei ka koste frontruta til en transporter 2018?", VW_T6, ["feil"]],
  ["FRONTRUTE VW TRANSPORTER 2008 PÅ LAGER?", VW_T5, ["feil"]],
  ["hei vi må ha ny frontrute på 2008 transporteren vår, den er coated", VW_T5, ["feil"]],
  ["trenger pris frontrute t6 2018 me sensor", VW_T6, ["feil"]],
  ["hei!rute til min bil transporter 2008", VW_T5, ["feil"]],
  ["Hei, vinduet foran på min transporter 2008 e knust, trenger ny", VW_T5, ["feil"]],
  ["hva koster frontrute til vw transporter 2018?? mvh", VW_T6, ["feil"]],
  // resten — varierte
  ["Hei, frontrute til VW Transporter 2008, men jeg vet ikke om den har antenne", VW_T5],
  ["Hei, frontrute til VW Transporter 2018. Ingen sensor, ingen varme, bare helt vanlig", VW_T6],
  ["Hei, jeg trenger frontrute til en Transporter 2008. Den er innkapslet", VW_T5],
  ["Vi skal ha frontrute til VW Transporter 2018, men bilen er usikker på utstyr. Kan du hjelpe?", VW_T6],
  ["Hei, trenger frontrute til VW Transporter 2008 — bare den billigste", VW_T5],
  ["Hei, frontrute til VW Transporter 2018, helst original kvalitet", VW_T6],
  ["Hei, er frontruta til VW Transporter 2008 lik for alle årsmodeller?", VW_T5],
  ["Hei, vi bytter frontrute på en VW Transporter 2018 neste uke. Hva trenger jeg å vite om kalibrering?", VW_T6],
  ["Hei, har dere lim til frontrute også? Skal bytte på en VW Transporter 2008", VW_T5],
];
for (const [msg, vehicle, flags] of front) {
  MESSAGES.push({ msg, cat: "frontrute", vehicle, candidates: T5T6, flags });
}
// fyll til 50
for (let i = front.length; i < 50; i++) {
  const msg = `Hei, jeg trenger frontrute til en VW Transporter ${i % 2 === 0 ? "2008" : "2018"}-modell`;
  MESSAGES.push({ msg, cat: "frontrute", vehicle: i % 2 === 0 ? VW_T5 : VW_T6, candidates: T5T6 });
}

// == BAKRUTE (20) ==
const bak: [string, string | null, string[]?][] = [
  ["Hei, jeg trenger bakrute til en Mini Cooper fra 2014", MINI],
  ["Bakrute til BMW 3-serie E30, helst med varmetråder", BMW3],
  ["Hei, hva koster bakrute til Mini Cooper 2014?", MINI],
  ["Vi trenger bakrute til en BMW 3-serie fra 1989", BMW3],
  ["Hei! Bakrute med varme til Mini Cooper 2014", MINI],
  ["Hei, trenger bakrute til en Mini Cooper. Den er sotet", MINI],
  ["hei bakrute til bmw 3 serie 89 model", BMW3, ["feil"]],
  ["trenger nytt bakvindu på mini cooper 2014", MINI, ["feil"]],
  ["hei ka koste bakruta til en bmw e30?", BMW3, ["feil"]],
  ["Bakrute bmw 3-serie e30 med varmetråd", BMW3, ["feil"]],
  ["Hei, bakrute til Mini Cooper 2014. Er den delt eller i ett stykke?", MINI],
  ["Hei, jeg lurer på om dere har bakrute på lager til en 3-serie E30", BMW3],
  ["Hei, vi har en kunde med Mini Cooper 2014 som trenger bakrute, sotet", MINI],
  ["hei, trenger bakrute mini 2014, den er mørk", MINI, ["feil"]],
  ["Bakrute til BMW 3-serie 89, har den i lager?", BMW3],
  ["Hei, hva er prisen på bakrute til Mini Cooper 2014 med og uten sotet?", MINI],
  ["Hei, bakvindu til min bmw 1989 er sprukket, hva har dere?", BMW3, ["feil"]],
  ["Hei, vi trenger bakrute til en Mini 2014, men usikker på om den har varme", MINI],
  ["Hei, bakrute til BMW E30 med varmetråder — kan du bekrefte at den passer?", BMW3],
  ["hei bakruta på mini cooper er ødelagt trenger ny sotet", MINI, ["feil"]],
];
for (const [msg, vehicle, flags] of bak) {
  MESSAGES.push({ msg, cat: "bakrute", vehicle, candidates: BAKRUTE, flags });
}

// == DØR/SIDERUTE (20) ==
const dorside: [string, string | null, string[]?][] = [
  ["Hei, jeg trenger dørrute fremme til en Mini Cooper Cabriolet 2014, førersiden", MINI],
  ["Dørrute bak venstre til Mini Cooper 2014", MINI],
  ["Hei, siderute til Mini Cooper Coupe 2014", MINI],
  ["Vi trenger dørrute til Mini Cooper Cabriolet, passasjersiden foran", MINI],
  ["Hei! Dørrute fremme høyre side til Mini Cooper 2014", MINI],
  ["Hei, hva koster siderute til Mini Cooper Coupe?", MINI],
  ["trenger dørrute til mini 2014 venstre side", MINI, ["feil"]],
  ["hei siderute mini cooper coupe sotet", MINI, ["feil"]],
  ["Dørrute bak til Mini Cooper 2014, høyre", MINI],
  ["Hei, vi trenger siderute til en Mini Cooper Coupe 2014, den åpne varianten", MINI],
  ["hei, dørglasset på førersia e knust på mini cab 2014", MINI, ["feil"]],
  ["Hei, liten rute bak døra på Mini Cooper 2014, hva koster den?", MINI],
  ["Siderute Mini Cooper Coupe 2014, sotet", MINI],
  ["hei trenger dørrute fremme mini cooper 2014 hs", MINI, ["feil"]],
  ["Hei, vi skal ha dørrute foran på venstre side til en Mini Cabriolet", MINI],
  ["Hei, hva koster dørrute fremme til Mini Cooper 2014?", MINI],
  ["hei ka e prisen på sideruta til mini coupe?", MINI, ["feil"]],
  ["Hei, dørrute bak venstre til Mini Cooper 2014 — har dere på lager?", MINI],
  ["Vi trenger ventile/siderute bak til en Mini Cooper 2014", MINI],
  ["hei trenger dørrute til mini cabriolet 2014 passasjersia", MINI, ["feil"]],
];
for (const [msg, vehicle, flags] of dorside) {
  MESSAGES.push({ msg, cat: "dorside", vehicle, candidates: msg.includes("side") || msg.includes("siderute") ? SIDE : DOR, flags });
}

// ── Kjøring ────────────────────────────────────────────────────────────────
interface Result {
  n: number; cat: Cat; msg: string; flags: string[];
  action: string | null; response: string | null; error: string | null;
  mentions_tilbehor: boolean; mentions_nummer: boolean; asks_bilinfo: boolean;
}

function checkHeuristics(msg: string, response: string | null): { mentions_tilbehor: boolean; mentions_nummer: boolean; asks_bilinfo: boolean } {
  const r = (response || "").toLowerCase();
  const skuMatch = msg.match(/\d{4,}[A-Z]{2,}/i);
  return {
    mentions_tilbehor: /lim|tilbehør|tilbehor|klips|pyntelist|primer/.test(r),
    mentions_nummer: skuMatch ? r.includes(skuMatch[0].toLowerCase()) : false,
    asks_bilinfo: /hvilken bil|hvilket merke|merke|modell|årsmodell|årsmodell|regnr/.test(r),
  };
}

async function main() {
  console.log(`Kjører ${MESSAGES.length} samtaler mot DeepSeek...`);
  const results: Result[] = [];
  let n = 0;
  for (const item of MESSAGES) {
    n++;
    const vehicle = item.vehicle
      ? (() => {
          const parts = item.vehicle.split(" ");
          const year = parseInt(parts[parts.length - 1], 10) || 2014;
          return { make: parts[0], model: parts.slice(1, -1).join(" ") || "Ukjent", year };
        })()
      : null;
    const ctx = {
      candidates: item.candidates,
      history: [{ role: "user" as const, content: item.msg }],
      extracted: {} as Record<string, string>,
      vehicle,
      ktypeFamily: null,
    };
    let action: string | null = null;
    let response: string | null = null;
    let error: string | null = null;
    try {
      const res = await generateDialogueTurn(env, ctx);
      if (res) {
        action = (res as any).action ?? null;
        response = (res as any).message ?? null;
      }
    } catch (e: any) {
      error = String(e?.message || e).slice(0, 120);
    }
    const h = checkHeuristics(item.msg, response);
    results.push({ n, cat: item.cat, msg: item.msg, flags: item.flags || [], action, response, error, ...h });
    if (n % 10 === 0) process.stdout.write(`  ${n}/${MESSAGES.length}\n`);
  }

  mkdirSync(join(process.cwd(), "results"), { recursive: true });
  writeFileSync(join(process.cwd(), "results", "simulation-90.json"), JSON.stringify(results, null, 2));

  // ── Oppsummering ──
  const byCat = { frontrute: results.filter(r => r.cat === "frontrute"), bakrute: results.filter(r => r.cat === "bakrute"), dorside: results.filter(r => r.cat === "dorside") };
  console.log("\n══════════ OPPsummering ══════════");
  for (const [cat, list] of Object.entries(byCat)) {
    const ok = list.filter(r => r.response && !r.error).length;
    const nummerMsgs = list.filter(r => r.flags.includes("nummer"));
    const nummerOk = nummerMsgs.filter(r => r.mentions_nummer).length;
    const tilbehorMsgs = list.filter(r => /bestill|skal ha|trenger|ønsker|takk/i.test(r.msg));
    const tilbehorOk = tilbehorMsgs.filter(r => r.mentions_tilbehor).length;
    const feilMsgs = list.filter(r => r.flags.includes("feil"));
    const feilOk = feilMsgs.filter(r => r.response && !r.error).length;
    console.log(`${cat}: ${ok}/${list.length} OK | nummer-gjenkjenning ${nummerOk}/${nummerMsgs.length} | tilbehør/lim-spørsmål ${tilbehorOk}/${tilbehorMsgs.length} | dårlig-norsk-håndtert ${feilOk}/${feilMsgs.length}`);
  }
  const totalOk = results.filter(r => r.response && !r.error).length;
  console.log(`\nTOTALT: ${totalOk}/${results.length} svar OK, ${results.length - totalOk} feil/uten svar`);
  const errors = results.filter(r => r.error);
  if (errors.length) {
    console.log("\nFeilmeldinger:");
    for (const e of errors) console.log(`  #${e.n} (${e.cat}): ${e.error}`);
  }
  // Stikkprøver av dårlig norsk
  const feilSamples = results.filter(r => r.flags.includes("feil")).slice(0, 6);
  console.log("\nStikkprøver (dårlig norsk → AI-svar):");
  for (const s of feilSamples) {
    console.log(`\n  🧑 «${s.msg}»\n  🤖 [${s.action}] ${(s.response || "").slice(0, 180)}`);
  }
  // Stikkprøver av nummer
  const numSamples = results.filter(r => r.flags.includes("nummer")).slice(0, 3);
  console.log("\nStikkprøver (nummer → AI-svar):");
  for (const s of numSamples) {
    console.log(`\n  🧑 «${s.msg}»\n  🤖 [${s.action}] ${(s.response || "").slice(0, 180)}`);
  }
  console.log("\nFull logg: results/simulation-90.json");
}

main().catch((e) => { console.error("Feil:", e); process.exit(1); });

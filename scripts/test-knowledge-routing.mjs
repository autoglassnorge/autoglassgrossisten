/**
 * Test script for Professor Autoglass knowledge routing
 * Tests: FAQ search, intent detection, B2B context
 * Knowledge routing ONLY triggers when: intent=kunnskap AND no vehicle data (regnr/make)
 */

// --- Copied logic from ordremottaker-knowledge.ts ---
const STOP_WORDS = new Set([
  "hva", "er", "den", "det", "jeg", "du", "en", "et", "og", "eller",
  "som", "til", "fra", "med", "på", "i", "å", "for", "om", "av",
  "ikke", "har", "kan", "skal", "vil", "hvordan", "når", "hvor",
  "hvilken", "hvem", "hvorfor", "hva", "the", "is", "a", "an",
  "and", "or", "to", "of", "in", "for", "with", "at", "by", "from"
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\sæøåéäöü]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

const FAQ_ARTICLES = [
  {
    id: "oem-vs-aftermarket",
    question: "Hva er forskjellen på OEM og aftermarket glass?",
    answer: "OEM (Original Equipment Manufacturer) er glass produsert av samme fabrikk som originalen på bilen — ofte med bilprodusentens logo. Aftermarket er glass fra samme eller annen produsent, men uten bilmerkets logo. Kvalitetsmessig er de ofte identiske. OEM koster typisk 30-50% mer. Som verksted velger du aftermarket for kostnadseffektivitet og konkurransekraft, mens leasing-biler og premium-kunder ofte foretrekker OEM. Autoglass AS fører begge deler og kan rådgi deg basert på kundesegment.",
    keywords: ["oem", "aftermarket", "original", "logo", "kvalitet", "pris", "forskjell", "verksted", "kostnad", "konkurranse", "leasing"]
  },
  {
    id: "adas-kalibrering",
    question: "Hva er ADAS-kalibrering, og når trengs det?",
    answer: "ADAS (Advanced Driver Assistance Systems) inkluderer kamera og sensorer bak frontruten — filskiftevarsel, adaptiv cruisekontroll, trafikkskiltgjenkjenning, etc. Når frontruten byttes, flyttes kameraet noen millimeter. Selv små avvik kan gjøre at systemene ikke fungerer korrekt. Kalibrering kreves ALLTID etter frontrutebytte på biler med ADAS. Som leverandør bør du informere verkstedet ditt om dette, slik at de kan prise det inn til sluttkunden. Noen biler krever dynamisk kalibrering (kjøring på vei), andre statisk kalibrering (foran target-plate).",
    keywords: ["adas", "kalibrering", "kamera", "sensor", "cruisekontroll", "filskifte", "lane", "assist", "pris", "montering", "verksted"]
  },
  {
    id: "leveringstid",
    question: "Hvor lang er leveringstiden på bilglass?",
    answer: "Leveringstiden avhenger av glassets tilgjengelighet: (1) På lager — vi har 2.500+ artikler på lager i Oslo. Levering neste virkedag til hele Norge. (2) Bestillingsvare, Europa — 3-5 virkedager for vanlige biler. (3) Bestillingsvare, sjeldne biler — 1-3 uker for spesielle biler. (4) Import fra Asia/USA — 2-6 uker for noen OEM-glass. Som B2B-kunde kan du alltid kontakte oss med regnr for umiddelbar lagerstatus. Vi jobber kontinuerlig med å utvide lageret for å redusere ventetid for dine kunder.",
    keywords: ["levering", "tid", "lager", "oslo", "norge", "bestilling", "import", "europa", "usa", "asia", "vente", "tilgjengelig"]
  },
  {
    id: "garanti",
    question: "Hva slags garanti får jeg som verksted på glass fra Autoglass AS?",
    answer: "Autoglass AS gir deg som B2B-kunde produktgaranti på alle glass vi leverer. Garantien dekker produktfeil, lekkasje i limfugen, og løsning fra karosseriet. Garantien dekker IKKE nye steinsprut eller skader etter levering, eller feil montering utført av tredjepart. Ved reklamasjon: kontakt oss med bilens regnr og eurocode, så ordner vi bytte eller refusjon. Vi står bak produktene våre — din kunde skal aldri få problemer på grunn av vårt glass.",
    keywords: ["garanti", "reklamasjon", "feil", "lekkasje", "limfuge", "produkt", "bytte", "refusjon", "verksted", "b2b", "dekning"]
  },
  {
    id: "eurocode",
    question: "Hva er en eurocode, og hvorfor er den viktig?",
    answer: "Eurocode (E-code/ECE-kode) er en standardisert kode som identifiserer et spesifikt bilglass. Koden ser slik ut: M0080AGNCMV. Den forteller: (1) Godkjenningsmerke (E) — godkjent for EU/EØS, (2) Produsent-kode, (3) Dimensjoner og form, (4) Utstyrskoder — ADAS, varme, regnsensor, HUD, etc. Som leverandør bruker du eurocode for å sikre at glasset er eksakt riktig. To glass kan se like ut, men ha ulik eurocode på grunn av forskjellig utstyr. Vi hjelper deg med å finne riktig eurocode basert på regnr, VIN eller kjøretøydata.",
    keywords: ["eurocode", "e-code", "ece", "kode", "identifisere", "standard", "godkjenning", "utstyr", "regnr", "vin"]
  },
];

function scoreArticle(query, article) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;

  let score = 0;
  const allText = `${article.question} ${article.answer} ${article.keywords.join(" ")}`;
  const textTokens = tokenize(allText);

  for (const qt of queryTokens) {
    if (article.keywords.some(k => k.toLowerCase() === qt)) {
      score += 3;
      continue;
    }
    if (article.keywords.some(k => k.toLowerCase().includes(qt))) {
      score += 2;
      continue;
    }
    if (textTokens.some(t => t === qt)) {
      score += 1;
    } else if (textTokens.some(t => t.includes(qt) || qt.includes(t))) {
      score += 0.5;
    }
  }
  return score / queryTokens.length;
}

function searchFaq(query) {
  if (!query || query.trim().length < 2) return null;
  let best = null;
  for (const article of FAQ_ARTICLES) {
    const score = scoreArticle(query, article);
    if (score > (best?.score ?? 0)) best = { article, score };
  }
  if (best && best.score >= 0.3) return best;
  return null;
}

// --- Copied intent logic from ordremottaker-ner.ts ---
const ORDER_KEYWORDS = ["trenger", "bestill", "vil ha", "skal ha", "mangler", "bytte", "ny", "nytt", "bestille", "ordre", "kjøpe", "kjenner du"];
const PRICE_KEYWORDS = ["pris", "hva koster", "prisen", "kostnad", "hvor mye"];
const KNOWLEDGE_KEYWORDS = [
  "hva er", "hva betyr", "hvordan", "hvorfor", "forklar", "forskjell", "forskjellen",
  "når", "hvor", "hvilken", "hvem", "kan jeg", "får jeg", "trekker", "betyr",
  "garanti", "reklamasjon", "retur", "bytte", "levering", "lager", "sporing",
  "tracking", "faktura", "ehf", "mva", "avtale", "rabatt", "kontakt", "telefon",
  "e-post", "leveringstid", "import", "oem", "aftermarket", "pilkington",
  "glavista", "euroglass", "eurocode", "e-code", "laminert", "herdet", "akustisk",
  "hud", "adas", "kalibrering", "regnsensor", "oppvarmet", "varme", "verksted",
  "grossist", "leverandør", "b2b", "explain", "what is", "how", "why", "when",
  "where", "which", "difference", "does", "can i", "do i need",
];

function extractIntent(text) {
  const lower = text.toLowerCase();
  const hasKnowledgeKw = KNOWLEDGE_KEYWORDS.some(k => lower.includes(k));
  const hasOrderKw = ORDER_KEYWORDS.some(k => lower.includes(k));
  const hasPriceKw = PRICE_KEYWORDS.some(k => lower.includes(k));

  const strongKnowledge =
    /^\s*(hva|hvordan|hvorfor|når|hvor|hvilken|hvem|forklar|what|how|why|when|where|which|explain|does)\b/i.test(text) ||
    /\b(garanti|reklamasjon|retur|bytte|leveringstid|lagerstatus|sporing|faktura|ehf|mva|avtalepris|kontakt|telefon|e-post|oem|aftermarket|pilkington|glavista|euroglass|eurocode|laminert|herdet|akustisk|hud|adas\s+kalibrering|regnsensor|oppvarmet|verksted|grossist|leverandør|b2b)\b/i.test(text);

  if (strongKnowledge && !hasOrderKw && !hasPriceKw) return "kunnskap";
  if (hasKnowledgeKw && !hasOrderKw && !hasPriceKw) return "kunnskap";
  if (hasOrderKw) return "bestill";
  if (hasPriceKw) return "prisforespørsel";
  if (hasKnowledgeKw) return "kunnskap";
  return "uklart";
}

/**
 * Simulates the handler's knowledge routing logic:
 * Knowledge routing triggers ONLY when intent=kunnskap AND no vehicle data (regnr/make)
 */
function shouldRouteToKnowledge(intent, hasVehicle) {
  return intent === 'kunnskap' && !hasVehicle;
}

// --- Test cases ---
const knowledgeTests = [
  { q: "Hva er forskjellen på OEM og aftermarket glass?", expectedId: "oem-vs-aftermarket", expectedIntent: "kunnskap", hasVehicle: false },
  { q: "Hvor lang er leveringstiden?", expectedId: "leveringstid", expectedIntent: "kunnskap", hasVehicle: false },
  { q: "Hva slags garanti får jeg?", expectedId: "garanti", expectedIntent: "kunnskap", hasVehicle: false },
  { q: "Hva er en eurocode?", expectedId: "eurocode", expectedIntent: "kunnskap", hasVehicle: false },
  { q: "Forklar ADAS-kalibrering", expectedId: "adas-kalibrering", expectedIntent: "kunnskap", hasVehicle: false },
];

const orderTests = [
  { q: "Jeg trenger en frontrute til VW Golf 2019", expectedIntent: "bestill", hasVehicle: true },
  { q: "Har dere glass til Volvo XC60 2020?", expectedIntent: "uklart", hasVehicle: true },  // "Har dere" not in order keywords, but has vehicle
  { q: "Jeg skal bytte bakrute på en BMW X5", expectedIntent: "bestill", hasVehicle: true },
  { q: "Hva koster en frontrute til Audi A4?", expectedIntent: "prisforespørsel", hasVehicle: true },
  { q: "Bestill siderute til Toyota Corolla 2018", expectedIntent: "bestill", hasVehicle: true },
];

console.log("=== KNOWLEDGE ROUTING TEST ===\n");
console.log("Routing rule: intent=kunnskap AND no vehicle data → FAQ\n");

let passed = 0;
let failed = 0;

for (const test of knowledgeTests) {
  const intent = extractIntent(test.q);
  const faq = searchFaq(test.q);
  const faqId = faq?.article?.id ?? null;
  const faqScore = faq?.score?.toFixed(2) ?? "N/A";
  const wouldRoute = shouldRouteToKnowledge(intent, test.hasVehicle);

  const intentOk = intent === test.expectedIntent;
  const faqOk = faqId === test.expectedId;
  const routingOk = wouldRoute === true; // Knowledge questions SHOULD route

  if (intentOk && faqOk && routingOk) {
    console.log(`✅ ${test.q}`);
    console.log(`   Intent: ${intent} | FAQ: ${faqId} (score: ${faqScore}) | Routes: YES`);
    passed++;
  } else {
    console.log(`❌ ${test.q}`);
    console.log(`   Expected intent: ${test.expectedIntent}, got: ${intent}`);
    console.log(`   Expected FAQ: ${test.expectedId}, got: ${faqId} (score: ${faqScore})`);
    console.log(`   Should route: YES, would route: ${wouldRoute}`);
    failed++;
  }
  console.log();
}

for (const test of orderTests) {
  const intent = extractIntent(test.q);
  const faq = searchFaq(test.q);
  const wouldRoute = shouldRouteToKnowledge(intent, test.hasVehicle);

  const intentOk = intent === test.expectedIntent;
  const routingOk = wouldRoute === false; // Orders should NOT route to knowledge

  if (intentOk && routingOk) {
    console.log(`✅ ${test.q}`);
    console.log(`   Intent: ${intent} | Routes to FAQ: NO (has vehicle data, correct)`);
    passed++;
  } else {
    console.log(`❌ ${test.q}`);
    console.log(`   Expected intent: ${test.expectedIntent}, got: ${intent}`);
    console.log(`   Should route: NO, would route: ${wouldRoute}`);
    console.log(`   FAQ match: ${faq?.article?.id ?? 'none'}`);
    failed++;
  }
  console.log();
}

console.log(`=== RESULT: ${passed}/${passed + failed} passed ===`);
if (failed > 0) {
  console.log("\nNote: Knowledge routing in handler requires BOTH intent=kunnskap AND no vehicle data.");
  console.log("Orders with vehicle info always go to glass search, even if FAQ has a weak match.");
}

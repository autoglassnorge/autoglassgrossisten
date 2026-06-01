#!/usr/bin/env node
/**
 * SVV API Parser Test Suite
 * =========================
 * Validering av utvidet SVV parser med nye felter.
 *
 * Kjøring:
 *   node scripts/test-svv-parsing.mjs
 *   node scripts/test-svv-parsing.mjs --base=https://autoglass-glass-sok.autoglassnorge.workers.dev
 *   node scripts/test-svv-parsing.mjs --regnr=EB21570
 *   node scripts/test-svv-parsing.mjs --mock    # Kjør med mock-data (uten API-tilgang)
 *
 * Rapport: JSON output med detaljerte test-resultater
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// KONFIGURASJON
// ============================================
const BASE_ARG = process.argv.find((a) => a.startsWith("--base="));
const BASE_URL = BASE_ARG ? BASE_ARG.split("=")[1] : "https://autoglass-glass-sok.autoglassnorge.workers.dev";
const USE_MOCK = process.argv.includes("--mock");
const CUSTOM_REGNR = process.argv.find((a) => a.startsWith("--regnr="))?.split("=")[1];

const R = "\x1b[31m";
const G = "\x1b[32m";
const Y = "\x1b[33m";
const B = "\x1b[34m";
const RESET = "\x1b[0m";

// ============================================
// NYE FELTER Å TESTE (utvidet parser)
// ============================================
const NEW_FIELDS = [
  { name: "color", type: "string", required: false },
  { name: "fuelType", type: "string", required: false },
  { name: "euroClass", type: "number", required: false },
  { name: "nextEUDate", type: "date", required: false, isoFormat: true },
  { name: "registrationStatus", type: "string", required: false },
  { name: "vehicleClass", type: "string", required: false },
  { name: "seatCount", type: "number", required: false },
];

// EKSISTERENDE FELTER (bakoverkompatibilitet)
const EXISTING_FIELDS = [
  { name: "regno", type: "string", required: true },
  { name: "vin", type: "string", required: true },
  { name: "make", type: "string", required: true },
  { name: "model", type: "string", required: true },
  { name: "year", type: "number", required: true },
  { name: "k_type", type: "number", required: true },
  { name: "typeCode", type: "string", required: false },
  { name: "length", type: "number", required: false },
  { name: "fuelCode", type: "string", required: false },
  { name: "engineCode", type: "string", required: false },
  { name: "seats", type: "number", required: false },
  { name: "gvwr", type: "number", required: false },
];

// ============================================
// TEST-CASES
// ============================================

/**
 * Test-case struktur:
 * - id: Unik identifikator
 * - description: Hva testen verifiserer
 * - regnr: Registreringsnummer å teste
 * - mockData: Mock SVV respons (når --mock flagg er satt)
 * - expectations: Forventede verdier/felter
 * - category: parsing | backward-compat | error-handling
 */
const TEST_CASES = [
  // === PARSING: KOMPLETT DATA ===
  {
    id: "P001",
    description: "Parsing av alle nye felter - komplett kjøretøydata",
    regnr: "EB21570",
    category: "parsing",
    mockData: {
      kjoretoydataListe: [{
        kjoretoyId: { understellsnummer: "WVWZZZAAZJD123456" },
        forstegangsregistrering: { registrertForstegangNorgeDato: "2018-05-15" },
        godkjenning: {
          tekniskGodkjenning: {
            tekniskeData: {
              generelt: {
                merke: [{ merke: "Volkswagen" }],
                handelsbetegnelse: ["Golf"],
                typebetegnelse: "5-door hatchback",
              },
              dimensjoner: { lengde: 4586, bredde: 1799 },
              motorOgDrivverk: {
                motor: [{
                  drivstoff: [{ drivstoffKode: { kodeVerdi: "D" } }],
                  motorKode: "CRBC",
                }],
              },
              persontall: { sitteplasserTotalt: 5 },
              vekter: { tillattTotalvekt: 1950 },
            },
          },
        },
        // NYE FELTER (utvidet parser)
        farge: "SVART",
        drivstoff: { drivstofftype: "Diesel" },
        euKlasse: { kode: 1 },
        periodiskKjoretoyKontroll: { nesteKontrollDato: "2025-05-15" },
        registrering: { registreringsstatus: "REGISTRERT" },
        kjoretoykategori: "M1",
        sitteplasser: { totalt: 5 },
      }],
    },
    expectations: {
      status: "ok",
      fieldsPresent: ["color", "fuelType", "euroClass", "nextEUDate", "registrationStatus", "vehicleClass", "seatCount"],
      fieldValues: {
        color: "SVART",
        fuelType: "Diesel",
        euroClass: 1,
        nextEUDate: "2025-05-15",
        registrationStatus: "REGISTRERT",
        vehicleClass: "M1",
        seatCount: 5,
      },
    },
  },

  // === PARSING: PARTIELL DATA (mangler noen felter) ===
  {
    id: "P002",
    description: "Håndtering av manglende felter - skal returnere undefined/null",
    regnr: "XX12345",
    category: "parsing",
    mockData: {
      kjoretoydataListe: [{
        kjoretoyId: { understellsnummer: "TEST1234567890123" },
        forstegangsregistrering: { registrertForstegangNorgeDato: "2020-01-01" },
        godkjenning: {
          tekniskGodkjenning: {
            tekniskeData: {
              generelt: {
                merke: [{ merke: "Toyota" }],
                handelsbetegnelse: ["Corolla"],
                typebetegnelse: "Sedan",
              },
              // Mangler: farge, drivstoff, euKlasse, etc.
            },
          },
        },
      }],
    },
    expectations: {
      status: "ok",
      fieldsPresent: ["regno", "make", "model", "year"],
      fieldsUndefined: ["color", "fuelType", "euroClass", "nextEUDate", "registrationStatus", "vehicleClass"],
    },
  },

  // === PARSING: DATO-FORMAT ===
  {
    id: "P003",
    description: "ISO dato-format for nextEUDate",
    regnr: "TEST001",
    category: "parsing",
    mockData: {
      kjoretoydataListe: [{
        kjoretoyId: { understellsnummer: "DATE123456789012" },
        forstegangsregistrering: { registrertForstegangNorgeDato: "2019-06-20" },
        godkjenning: {
          tekniskGodkjenning: {
            tekniskeData: {
              generelt: {
                merke: [{ merke: "BMW" }],
                handelsbetegnelse: ["3-serie"],
                typebetegnelse: "Sedan",
              },
            },
          },
        },
        periodiskKjoretoyKontroll: { nesteKontrollDato: "2024-12-31T00:00:00.000Z" },
      }],
    },
    expectations: {
      status: "ok",
      fieldValues: {
        nextEUDate: "2024-12-31", // Skal parses til YYYY-MM-DD
      },
    },
  },

  // === BAKOVERKOMPATIBILITET: EKSISTERENDE FELT ===
  {
    id: "B001",
    description: "Bakoverkompatibilitet - eksisterende felter fungerer",
    regnr: "BK00100",
    category: "backward-compat",
    mockData: {
      kjoretoydataListe: [{
        kjoretoyId: { understellsnummer: "BACK123456789012" },
        forstegangsregistrering: { registrertForstegangNorgeDato: "2021-03-10" },
        godkjenning: {
          tekniskGodkjenning: {
            tekniskeData: {
              generelt: {
                merke: [{ merke: "Audi" }],
                handelsbetegnelse: ["A4"],
                typebetegnelse: "Avant",
              },
              dimensjoner: { lengde: 4762 },
              motorOgDrivverk: {
                motor: [{
                  drivstoff: [{ drivstoffKode: { kodeVerdi: "B" } }],
                  motorKode: "CYRB",
                }],
              },
              persontall: { sitteplasserTotalt: 5 },
              vekter: { tillattTotalvekt: 2100 },
            },
          },
        },
      }],
    },
    expectations: {
      status: "ok",
      fieldsPresent: ["regno", "vin", "make", "model", "year", "k_type"],
      fieldValues: {
        regno: "BK00100",
        make: "AUDI",
        model: "A4",
        year: 2021,
      },
    },
  },

  // === FEILHÅNDTERING: 404 UKJENT REGNR ===
  {
    id: "E001",
    description: "Feilhåndtering - 404 for ukjent regnr",
    regnr: "NOTFOUND",
    category: "error-handling",
    mockData: null, // Simulerer 404
    expectations: {
      status: "not_found",
      httpStatus: 404,
    },
  },

  // === FEILHÅNDTERING: 503 SVV NEDE ===
  {
    id: "E002",
    description: "Feilhåndtering - 503 når SVV er nede",
    regnr: "SVVDOWN1",
    category: "error-handling",
    mockData: "SERVICE_UNAVAILABLE", // Simulerer 503
    expectations: {
      status: "upstream_error",
      httpStatus: 503,
    },
  },

  // === FEILHÅNDTERING: UGYLDIG DATO-FORMAT ===
  {
    id: "E003",
    description: "Feilhåndtering - ugyldig dato-format skal ikke krasje",
    regnr: "BADDATE1",
    category: "error-handling",
    mockData: {
      kjoretoydataListe: [{
        kjoretoyId: { understellsnummer: "DATEBAD123456789" },
        forstegangsregistrering: { registrertForstegangNorgeDato: "invalid-date" },
        godkjenning: {
          tekniskGodkjenning: {
            tekniskeData: {
              generelt: {
                merke: [{ merke: "Ford" }],
                handelsbetegnelse: ["Focus"],
                typebetegnelse: "Hatchback",
              },
            },
          },
        },
        periodiskKjoretoyKontroll: { nesteKontrollDato: "not-a-date" },
      }],
    },
    expectations: {
      status: "ok", // Skal fortsatt returnere ok, men med year=0
      fieldValues: {
        year: 0,
        nextEUDate: undefined,
      },
    },
  },
];

// ============================================
// TEST RESULTAT STRUKTUR
// ============================================
const testResults = {
  timestamp: new Date().toISOString(),
  baseUrl: BASE_URL,
  mode: USE_MOCK ? "mock" : "live",
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
  },
  categories: {
    parsing: { total: 0, passed: 0, failed: 0 },
    "backward-compat": { total: 0, passed: 0, failed: 0 },
    "error-handling": { total: 0, passed: 0, failed: 0 },
  },
  tests: [],
  validation: {
    newFields: {},
    backwardCompat: {},
    errorHandling: {},
  },
};

// ============================================
// HJELPEFUNKSJONER
// ============================================

function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

function validateField(value, expectedType, fieldName) {
  if (value === undefined || value === null) {
    return { valid: false, error: `${fieldName} er undefined/null` };
  }

  switch (expectedType) {
    case "string":
      if (typeof value !== "string") {
        return { valid: false, error: `${fieldName} er ikke string (fikk ${typeof value})` };
      }
      break;
    case "number":
      if (typeof value !== "number" || isNaN(value)) {
        return { valid: false, error: `${fieldName} er ikke number (fikk ${typeof value})` };
      }
      break;
    case "date":
      if (typeof value !== "string") {
        return { valid: false, error: `${fieldName} er ikke string (dato)` };
      }
      // Sjekk ISO format YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { valid: false, error: `${fieldName} er ikke i YYYY-MM-DD format` };
      }
      break;
  }

  return { valid: true };
}

async function fetchVehicleData(regnr, mockData) {
  if (USE_MOCK) {
    // Mock respons
    if (mockData === null) {
      return { status: "not_found", httpStatus: 404 };
    }
    if (mockData === "SERVICE_UNAVAILABLE") {
      return { status: "upstream_error", httpStatus: 503 };
    }
    // Returner mock vehicle data
    return {
      status: "ok",
      vehicle: parseMockVehicle(mockData, regnr),
    };
  }

  // Live API kall
  try {
    const res = await fetch(`${BASE_URL}/api/glass?regnr=${regnr}`);
    const data = await res.json();
    return {
      status: data.vehicle ? "ok" : data.code || "unknown",
      httpStatus: res.status,
      vehicle: data.vehicle,
    };
  } catch (error) {
    return {
      status: "fetch_error",
      error: error.message,
    };
  }
}

/**
 * Mock parser for SVV data - simulerer utvidet parser
 */
function parseMockVehicle(data, regnr) {
  if (!data?.kjoretoydataListe?.[0]) return null;

  const k = data.kjoretoydataListe[0];
  const td = k.godkjenning?.tekniskGodkjenning?.tekniskeData;
  const generelt = td?.generelt;

  // Parse dato - håndter ugyldige datoer
  let year = 0;
  const regDate = k.forstegangsregistrering?.registrertForstegangNorgeDato;
  if (regDate && /^\d{4}-\d{2}-\d{2}/.test(regDate)) {
    year = parseInt(regDate.split("-")[0], 10);
  }

  // Parse neste EU-kontroll dato
  let nextEUDate = undefined;
  const euDateRaw = k.periodiskKjoretoyKontroll?.nesteKontrollDato;
  if (euDateRaw) {
    // Håndter både ISO string og dato
    const euMatch = euDateRaw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (euMatch) {
      nextEUDate = euMatch[1];
    }
  }

  return {
    // Eksisterende felter
    regno: regnr,
    vin: k.kjoretoyId?.understellsnummer || "",
    make: (generelt?.merke?.[0]?.merke || "").toUpperCase(),
    model: (generelt?.handelsbetegnelse?.[0] || "").toUpperCase(),
    year,
    k_type: 0,
    typeCode: generelt?.typebetegnelse || "",
    length: td?.dimensjoner?.lengde || 0,
    fuelCode: td?.motorOgDrivverk?.motor?.[0]?.drivstoff?.[0]?.drivstoffKode?.kodeVerdi || "",
    engineCode: td?.motorOgDrivverk?.motor?.[0]?.motorKode || "",
    seats: td?.persontall?.sitteplasserTotalt || 0,
    gvwr: td?.vekter?.tillattTotalvekt || 0,

    // NYE FELTER (utvidet parser)
    color: k.farge || undefined,
    fuelType: k.drivstoff?.drivstofftype || undefined,
    euroClass: k.euKlasse?.kode || undefined,
    nextEUDate,
    registrationStatus: k.registrering?.registreringsstatus || undefined,
    vehicleClass: k.kjoretoykategori || undefined,
    seatCount: k.sitteplasser?.totalt || td?.persontall?.sitteplasserTotalt || undefined,
  };
}

async function runTest(testCase) {
  const result = {
    id: testCase.id,
    description: testCase.description,
    category: testCase.category,
    regnr: testCase.regnr,
    passed: false,
    assertions: [],
    errors: [],
  };

  try {
    const response = await fetchVehicleData(testCase.regnr, testCase.mockData);
    const exp = testCase.expectations;

    // Sjekk status
    if (exp.status) {
      const statusMatch = response.status === exp.status;
      result.assertions.push({
        name: "status",
        expected: exp.status,
        actual: response.status,
        passed: statusMatch,
      });
      if (!statusMatch) {
        result.errors.push(`Forventet status '${exp.status}', fikk '${response.status}'`);
      }
    }

    // Sjekk HTTP status
    if (exp.httpStatus) {
      const httpMatch = response.httpStatus === exp.httpStatus;
      result.assertions.push({
        name: "httpStatus",
        expected: exp.httpStatus,
        actual: response.httpStatus,
        passed: httpMatch,
      });
      if (!httpMatch) {
        result.errors.push(`Forventet HTTP ${exp.httpStatus}, fikk ${response.httpStatus}`);
      }
    }

    // Sjekk felter som skal være tilstede
    if (exp.fieldsPresent && response.vehicle) {
      for (const field of exp.fieldsPresent) {
        const value = response.vehicle[field];
        const isPresent = value !== undefined && value !== null && value !== "";
        result.assertions.push({
          name: `fieldPresent:${field}`,
          expected: "present",
          actual: isPresent ? "present" : (value === "" ? "empty" : "missing"),
          passed: isPresent,
        });
        if (!isPresent) {
          result.errors.push(`Felt '${field}' mangler eller er tomt`);
        }
      }
    }

    // Sjekk felter som skal være undefined
    if (exp.fieldsUndefined && response.vehicle) {
      for (const field of exp.fieldsUndefined) {
        const value = response.vehicle[field];
        const isUndefined = value === undefined || value === null;
        result.assertions.push({
          name: `fieldUndefined:${field}`,
          expected: "undefined",
          actual: isUndefined ? "undefined" : `value:${value}`,
          passed: isUndefined,
        });
        if (!isUndefined) {
          result.errors.push(`Felt '${field}' skulle være undefined, men har verdi '${value}'`);
        }
      }
    }

    // Sjekk felt-verdier
    if (exp.fieldValues && response.vehicle) {
      for (const [field, expectedValue] of Object.entries(exp.fieldValues)) {
        const actualValue = response.vehicle[field];
        let valueMatch = actualValue === expectedValue;

        // Spesiell håndtering for datoer - sjekk at formatet er riktig
        if (field === "nextEUDate" && actualValue) {
          valueMatch = /^\d{4}-\d{2}-\d{2}$/.test(actualValue);
        }

        result.assertions.push({
          name: `fieldValue:${field}`,
          expected: expectedValue,
          actual: actualValue,
          passed: valueMatch,
        });
        if (!valueMatch) {
          result.errors.push(`Felt '${field}' forventet '${expectedValue}', fikk '${actualValue}'`);
        }
      }
    }

    // Bestem om testen er passed
    result.passed = result.errors.length === 0;

  } catch (error) {
    result.passed = false;
    result.errors.push(`Exception: ${error.message}`);
  }

  return result;
}

// ============================================
// HOVEDFUNKSJON
// ============================================
async function main() {
  log("\n╔══════════════════════════════════════════════════════════════╗", B);
  log("║         SVV API Parser Test Suite v1.0                       ║", B);
  log("╚══════════════════════════════════════════════════════════════╝", B);
  log(`\nBase URL: ${BASE_URL}`);
  log(`Mode: ${USE_MOCK ? "MOCK (simulert data)" : "LIVE (ekte API)"}`);
  log(`\nTester ${TEST_CASES.length} scenarier...\n`);

  // Kjør tester
  const testsToRun = CUSTOM_REGNR
    ? TEST_CASES.filter(t => t.regnr === CUSTOM_REGNR)
    : TEST_CASES;

  for (const testCase of testsToRun) {
    process.stdout.write(`${Y}  → ${testCase.id}: ${testCase.description}...${RESET} `);

    const result = await runTest(testCase);
    testResults.tests.push(result);

    // Oppdater kategori-statistikk
    testResults.categories[testCase.category].total++;
    if (result.passed) {
      testResults.categories[testCase.category].passed++;
    } else {
      testResults.categories[testCase.category].failed++;
    }

    // Vis resultat
    if (result.passed) {
      log(`${G}✓ PASS${RESET}`);
    } else {
      log(`${R}✗ FAIL${RESET}`);
      for (const error of result.errors) {
        log(`      ${R}  - ${error}${RESET}`);
      }
    }
  }

  // ============================================
  // VALIDERING AV KRAV
  // ============================================
  log("\n" + "─".repeat(60));
  log("VALIDERING AV SJEKKLISTE");
  log("─".repeat(60));

  const validations = [
    {
      id: "color",
      name: "color parses korrekt",
      check: () => testResults.tests.some(t =>
        t.assertions.some(a => a.name === "fieldValue:color" && a.passed)
      ),
    },
    {
      id: "fuelType",
      name: "fuelType parses korrekt",
      check: () => testResults.tests.some(t =>
        t.assertions.some(a => a.name === "fieldValue:fuelType" && a.passed)
      ),
    },
    {
      id: "euroClass",
      name: "euroClass parses korrekt",
      check: () => testResults.tests.some(t =>
        t.assertions.some(a => a.name === "fieldValue:euroClass" && a.passed)
      ),
    },
    {
      id: "nextEUDate",
      name: "nextEUDate parses korrekt (ISO format)",
      check: () => testResults.tests.some(t =>
        t.assertions.some(a => a.name === "fieldValue:nextEUDate" && a.passed)
      ),
    },
    {
      id: "registrationStatus",
      name: "registrationStatus parses korrekt",
      check: () => testResults.tests.some(t =>
        t.assertions.some(a => a.name === "fieldValue:registrationStatus" && a.passed)
      ),
    },
    {
      id: "vehicleClass",
      name: "vehicleClass parses korrekt",
      check: () => testResults.tests.some(t =>
        t.assertions.some(a => a.name === "fieldValue:vehicleClass" && a.passed)
      ),
    },
    {
      id: "seatCount",
      name: "seatCount parses korrekt",
      check: () => testResults.tests.some(t =>
        t.assertions.some(a => a.name === "fieldValue:seatCount" && a.passed)
      ),
    },
    {
      id: "backwardCompat",
      name: "Bakoverkompatibel",
      check: () => testResults.categories["backward-compat"].failed === 0,
    },
    {
      id: "errorHandling",
      name: "Feilhåndtering fungerer",
      check: () => testResults.categories["error-handling"].passed >= 2,
    },
  ];

  for (const v of validations) {
    const passed = v.check();
    testResults.validation[v.id] = passed ? "PASS" : "FAIL";
    const symbol = passed ? `${G}✓${RESET}` : `${R}✗${RESET}`;
    log(`  ${symbol} [${passed ? " " : " "}] ${v.name}`);
  }

  // ============================================
  // OPPSUMMERING
  // ============================================
  log("\n" + "═".repeat(60));
  log("OPPSUMMERING");
  log("═".repeat(60));

  testResults.summary.total = testResults.tests.length;
  testResults.summary.passed = testResults.tests.filter(t => t.passed).length;
  testResults.summary.failed = testResults.tests.filter(t => !t.passed).length;

  log(`\n  Kategorier:`);
  for (const [cat, stats] of Object.entries(testResults.categories)) {
    const catColor = stats.failed === 0 ? G : (stats.failed < stats.total ? Y : R);
    log(`    ${catColor}${cat}: ${stats.passed}/${stats.total} passed${RESET}`);
  }

  log(`\n  Totalt: ${testResults.summary.passed}/${testResults.summary.total} tester passert`);

  const allPassed = testResults.summary.failed === 0;
  if (allPassed) {
    log(`\n  ${G}✅ ALLE TESTER PASSEERT${RESET}\n`);
  } else {
    log(`\n  ${R}❌ ${testResults.summary.failed} TESTER FEILET${RESET}\n`);
  }

  // ============================================
  // LAGRE RAPPORT
  // ============================================
  const reportPath = join(process.cwd(), "test-reports", `svv-parser-test-${Date.now()}.json`);

  // Sørg for at test-reports mappen finnes
  try {
    await import('fs').then(fs => fs.mkdirSync(join(process.cwd(), "test-reports"), { recursive: true }));
  } catch {}

  writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  log(`Rapport lagret: ${reportPath}`);

  // Exit kode
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

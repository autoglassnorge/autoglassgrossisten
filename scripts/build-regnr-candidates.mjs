#!/usr/bin/env node
/**
 * build-regnr-candidates.mjs
 *
 * Collects all potential Norwegian registration numbers from internal data
 * sources and the finn.no scraper output, normalizes, validates, filters
 * placeholders, deduplicates, and writes candidate lists.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");

// --------------------------------------------------------------------------
// Known placeholder registration numbers (must be excluded)
// --------------------------------------------------------------------------
const PLACEHOLDERS = new Set([
  "AB12345", "AK12345", "AX12345", "BD54321", "BL98765", "BS12345",
  "BY67890", "CV98765", "CT12345", "DB00408", "DB0118", "DD10707",
  "DL48944", "DN70325", "DR98765", "DT10555", "DW01349", "EB54956",
  "ED50255", "EK20163", "EL12345", "FD22761", "FM98765", "FT51020",
  "FW00821", "GN12345", "HO98765", "JP12345", "JV18127", "KB35506",
  "KN98765", "LJ38798", "LR12345", "LY77907", "MS98765", "NF40696",
  "NT12345", "OW98765", "PA12345", "PP63104", "QB98765", "RC12345",
  "RK62967", "SD98765", "SU18018", "TE12345", "UF69767", "UF98765",
  "UX71699", "VH87073", "VJ27471", "VT16771", "VX4485", "XA19177",
  "XD75719", "XN27507", "XN38119", "YQ2006", "ZH31259", "TEST123",
]);

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/**
 * Normalize a raw string:
 *  - trim
 *  - uppercase
 *  - remove all whitespace characters
 *  - strip prefix like "Regnr.:", "Regnr:", "Regnr", etc.
 */
function normalize(raw) {
  let s = String(raw).trim().toUpperCase();
  // Remove all whitespace (spaces, tabs, non-breaking spaces, etc.)
  s = s.replace(/\s+/g, "");
  // Strip common prefixes (case-insensitive already handled by toUpperCase)
  s = s.replace(/^REGNR\.?:?/, "");
  return s;
}

/**
 * Extract the first Norwegian registration number pattern from a string.
 * Pattern: two letters (A-H, J-N, P-R, Z — i.e. excluding I, O, Q)
 * followed by 4 or 5 digits.
 */
const REGNR_PATTERN = /[A-HJ-NPR-Z]{2}\d{4,5}/;

function extractRegnr(s) {
  const m = s.match(REGNR_PATTERN);
  return m ? m[0] : null;
}

/**
 * Validate a candidate against the strict Norwegian regnr format.
 */
const REGNR_STRICT = /^[A-HJ-NPR-Z]{2}\d{4,5}$/;

function isValid(regnr) {
  return REGNR_STRICT.test(regnr);
}

/**
 * Parse a text file with one entry per line, skipping blank lines
 * and lines starting with #.
 */
function parseTextFile(path) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf-8");
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

/**
 * Process a raw string through the full pipeline and return a valid regnr
 * or null.
 */
function processRaw(raw) {
  const normalized = normalize(raw);
  const extracted = extractRegnr(normalized);
  if (!extracted) return null;
  if (!isValid(extracted)) return null;
  if (PLACEHOLDERS.has(extracted)) return null;
  return extracted;
}

// --------------------------------------------------------------------------
// Source loaders
// --------------------------------------------------------------------------

/** 1. orders-eurocode-mapping.json — `regnr` array field per order */
function loadOrders() {
  const path = join(DATA_DIR, "orders-eurocode-mapping.json");
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, "utf-8"));
  const rawStrings = [];
  for (const order of Array.isArray(data) ? data : []) {
    if (Array.isArray(order.regnr)) {
      rawStrings.push(...order.regnr);
    }
  }
  return rawStrings;
}

/** 2. bovsoft-bootstrap-results.json — `results[].regnr` */
function loadBovsoft() {
  const path = join(DATA_DIR, "bovsoft-bootstrap-results.json");
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, "utf-8"));
  const rawStrings = [];
  if (Array.isArray(data.results)) {
    for (const r of data.results) {
      if (r.regnr) rawStrings.push(r.regnr);
    }
  }
  return rawStrings;
}

/** 3. populaere-regnr.txt — text file, one per line, filter comments */
function loadPopular() {
  return parseTextFile(join(DATA_DIR, "populaere-regnr.txt"));
}

/** 4. regnr-manual-seed.txt — if exists, one per line */
function loadManual() {
  return parseTextFile(join(DATA_DIR, "regnr-manual-seed.txt"));
}

/** 5. finn-no-regnr-raw.json — `brands.*.regnrs` */
function loadFinn() {
  const path = join(DATA_DIR, "finn-no-regnr-raw.json");
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, "utf-8"));
  const rawStrings = [];
  if (data && typeof data.brands === "object" && data.brands !== null) {
    for (const brand of Object.values(data.brands)) {
      if (Array.isArray(brand.regnrs)) {
        rawStrings.push(...brand.regnrs);
      }
    }
  }
  return rawStrings;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

const sources = {
  orders: loadOrders(),
  bovsoft: loadBovsoft(),
  popular: loadPopular(),
  manual: loadManual(),
  finn: loadFinn(),
};

// Map: regnr -> Set<sourceKey>
const candidates = new Map();

for (const [sourceKey, rawList] of Object.entries(sources)) {
  for (const raw of rawList) {
    const regnr = processRaw(raw);
    if (!regnr) continue;
    if (!candidates.has(regnr)) {
      candidates.set(regnr, new Set());
    }
    candidates.get(regnr).add(sourceKey);
  }
}

// Build sorted array
const sorted = Array.from(candidates.keys()).sort();

// Build entries with source arrays
const entries = sorted.map((regnr) => ({
  regnr,
  sources: Array.from(candidates.get(regnr)).sort(),
}));

// Per-source counts
const sourceCounts = {};
for (const [key, rawList] of Object.entries(sources)) {
  const validCount = rawList
    .map(processRaw)
    .filter((r) => r !== null).length;
  sourceCounts[key] = validCount;
}

// --------------------------------------------------------------------------
// Write outputs
// --------------------------------------------------------------------------

const generatedAt = new Date().toISOString();

// Plain text
writeFileSync(join(DATA_DIR, "regnr-candidates.txt"), sorted.join("\n") + "\n", "utf-8");

// JSON metadata
const jsonOutput = {
  generatedAt,
  totalCandidates: sorted.length,
  sources: sourceCounts,
  entries,
};
writeFileSync(
  join(DATA_DIR, "regnr-candidates.json"),
  JSON.stringify(jsonOutput, null, 2) + "\n",
  "utf-8"
);

// --------------------------------------------------------------------------
// Console summary
// --------------------------------------------------------------------------
console.log("=== Regnr Candidate Build Summary ===");
console.log(`Generated at : ${generatedAt}`);
console.log("");
console.log("Sources processed:");
for (const [key, count] of Object.entries(sourceCounts)) {
  console.log(`  ${key.padEnd(8)} : ${count} valid candidates`);
}
console.log("");
console.log(`Total unique candidates : ${sorted.length}`);
console.log("");
console.log("Output files:");
console.log("  data/regnr-candidates.txt");
console.log("  data/regnr-candidates.json");

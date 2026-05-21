#!/usr/bin/env node
/**
 * Debug version of merge-nags.ts — logs every match attempt
 * to identify systematic mismatch patterns.
 */
import { readFileSync } from 'fs';

const MAKE_ALIASES = {
  "gm": "CHEVROLET", "gmc": "GMC", "chevy": "CHEVROLET", "chev": "CHEVROLET",
  "merc": "MERCURY", "olds": "OLDSMOBILE", "pont": "PONTIAC",
  "chrys": "CHRYSLER", "ply": "PLYMOUTH", "intl": "INTERNATIONAL",
};

function normalizeMake(make) {
  if (!make) return "";
  const m = make.toUpperCase().trim();
  const clean = m.replace(/\s+(TRUCK|PICKUP|VAN|CONVERTIBLE|COUPE|SEDAN|HATCHBACK|WAGON|CAB|UTILITY)\s*$/i, "").trim();
  return MAKE_ALIASES[clean.toLowerCase()] || clean;
}

function normalizeModel(model) {
  if (!model) return "";
  return model.toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferGlassType(nagsCode) {
  const prefix = nagsCode.substring(0, 2).toUpperCase();
  switch (prefix) {
    case "DW": case "FW": case "DL": case "FL": return "frontrute";
    case "DB": case "FB": return "bakrute";
    case "DD": case "FD": return "siderute";
    case "DQ": case "FQ": return "siderute";
    case "DV": case "FV": return "siderute";
    case "DS": case "FS": return "siderute";
    default: return "annet";
  }
}

function modelMatches(searchModel, recordModel) {
  if (!recordModel) return false;
  const sm = normalizeModel(searchModel);
  const rm = normalizeModel(recordModel);

  if (sm.includes(rm) || rm.includes(sm)) return true;

  const sTokens = sm.split(/\s+/).filter(t => t.length >= 2);
  const rTokens = rm.split(/\s+/).filter(t => t.length >= 2);
  const common = sTokens.filter(t => rTokens.includes(t));

  if (common.length >= 2) return true;
  if (common.length === 1 && common[0].length >= 3) return true;

  const shortModels = ["LS", "CTS", "CT4", "CT5", "CT6", "XT4", "XT5", "XT6", "SRX", "XTS", "ATS", "G6", "G8", "H1", "H2", "H3", "PT"];
  for (const m of shortModels) {
    if (sTokens.includes(m) && rTokens.includes(m)) return true;
  }

  for (const st of sTokens) {
    for (const rt of rTokens) {
      if (st.length >= 3 && rt.length >= 3) {
        if (st.includes(rt) || rt.includes(st)) return true;
      }
    }
  }

  return false;
}

// ─── Load data ───
const catalog = JSON.parse(readFileSync('data/catalog-prod.json', 'utf-8'));
const records = catalog.records;

const nagsData = JSON.parse(readFileSync('data/nags-all-combined.json', 'utf-8'));
const nagsEntries = nagsData.entries;

// ─── Focus on US brands ───
const usBrands = ['FORD','CHEVROLET','CADILLAC','DODGE','JEEP','CHRYSLER',
  'LINCOLN','BUICK','PONTIAC','OLDSMOBILE','GMC','HUMMER','MERCURY','TESLA'];

const usRecords = records.filter(r => usBrands.includes(r.brand));
const usNags = nagsEntries.filter(n => usBrands.includes(normalizeMake(n.make)));

console.log('═══════════════════════════════════════════════════════════════');
console.log('  DEBUG MERGE-NAGS — US Brands Only');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`US records in catalog: ${usRecords.length}`);
console.log(`US NAGS entries: ${usNags.length}\n`);

// ─── Sample matching attempts ───
const sampleSize = 50;
const samples = usNags.slice(0, sampleSize);

let totalMatches = 0;
const debugLog = [];

for (const nags of samples) {
  const nagsMake = normalizeMake(nags.make);
  const nagsModel = normalizeModel(nags.model);
  const nagsType = nags.glassType || inferGlassType(nags.nagsCode);
  
  const candidateRecords = usRecords.filter(r => normalizeMake(r.brand) === nagsMake);
  
  const matches = candidateRecords.filter(r => {
    const recordType = r.category?.toLowerCase() || "annet";
    const nagsTypeLower = nagsType.toLowerCase();
    if (nagsTypeLower !== recordType && !r.description?.toLowerCase().includes(nagsTypeLower)) {
      if (recordType !== "annet") return false;
    }
    if (nags.yearFrom && r.yearTo && nags.yearFrom > r.yearTo) return false;
    if (nags.yearTo && r.yearFrom && nags.yearTo < r.yearFrom) return false;
    if (!modelMatches(nagsModel, r.model)) return false;
    return true;
  });
  
  if (matches.length > 0) totalMatches += matches.length;
  
  debugLog.push({
    nagsCode: nags.nagsCode + (nags.suffix ? ' ' + nags.suffix : ''),
    nagsMake,
    nagsModel,
    nagsType,
    nagsYearFrom: nags.yearFrom,
    nagsYearTo: nags.yearTo,
    candidates: candidateRecords.length,
    matches: matches.length,
    matchModels: matches.slice(0, 3).map(r => r.model),
    reason: matches.length === 0 ? 'NO_MATCH' : 'MATCHED'
  });
}

// ─── Show failures ───
const failures = debugLog.filter(d => d.matches === 0);
console.log(`📊 SAMPLE RESULTS (${sampleSize} NAGS entries tested)`);
console.log(`   Matches found: ${totalMatches}`);
console.log(`   No match: ${failures.length}`);
console.log();

console.log('❌ TOP FAILURE PATTERNS (NAGS model vs catalog models):');
for (const d of failures.slice(0, 20)) {
  console.log(`   NAGS: ${d.nagsCode.padEnd(12)} ${d.nagsMake.padEnd(12)} ${d.nagsModel.padEnd(30)} yr:${d.nagsYearFrom}-${d.nagsYearTo}`);
  // Show a few candidate catalog models
  const candidates = usRecords.filter(r => normalizeMake(r.brand) === d.nagsMake).slice(0, 5);
  for (const c of candidates) {
    console.log(`      → catalog: ${c.model.padEnd(40)} | ${c.eurocode} | ${c.category}`);
  }
}

console.log();
console.log('✅ SUCCESSFUL MATCHES:');
for (const d of debugLog.filter(d => d.matches > 0).slice(0, 10)) {
  console.log(`   ${d.nagsCode.padEnd(12)} → ${d.matchModels.join(', ')}`);
}

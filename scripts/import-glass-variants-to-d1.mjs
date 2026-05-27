#!/usr/bin/env node
/**
 * import-glass-variants-to-d1.mjs
 * ================================
 * Importerer glassvarianter fra JSON inn i D1-tabellen glass_variants.
 * Oppdatert for migrasjon 0009: sensor/fitment-felter + evidence-tabell.
 *
 * BRUK:
 *   node scripts/import-glass-variants-to-d1.mjs
 *   node scripts/import-glass-variants-to-d1.mjs --input data/glass-variants-d1-ready.json
 *   node scripts/import-glass-variants-to-d1.mjs --dry-run
 *   node scripts/import-glass-variants-to-d1.mjs --remote       # prod
 *   node scripts/import-glass-variants-to-d1.mjs --local        # dev (default)
 *
 * Avhengigheter: ingen npm-pakker (bruker built-in node + wrangler via npx)
 *
 * Idempotent: ON CONFLICT DO UPDATE — trygt å kjøre flere ganger.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';

// ─── Konfig ──────────────────────────────────────────────────────────────────
const DB_NAME          = 'glass-catalog-db';
const WRANGLER_DIR     = '/Users/taj/bilglass/api/cf-worker';
const DEFAULT_INPUT    = path.join(process.cwd(), 'data', 'ktype-glass-variants.json');
const CHUNK_SIZE       = 50;   // INSERT-er per wrangler-kall (D1 batch limit)
const DEFAULT_MARKET   = 'EU';
const DEFAULT_CONFIDENCE = 0.80;

// ─── CLI args ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const args = {
  input:   argVal('--input')  || DEFAULT_INPUT,
  remote:  argv.includes('--remote'),
  local:   !argv.includes('--remote'),
  dryRun:  argv.includes('--dry-run'),
  verbose: argv.includes('--verbose') || argv.includes('-v'),
};

function argVal(flag) {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function boolInt(v) {
  return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
}

function safeJson(v) {
  if (v === null || v === undefined) return '{}';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

/**
 * Trekk ut sensor/fitment-felter fra input JSON.
 * Bakoverkompatibel: støtter både nye strukturerte felter og gammel features_json.
 */
function extractSensorFields(variant) {
  const features = variant.features_json ?? variant.features ?? {};
  const raw = variant.raw_payload ?? variant.raw ?? {};
  const desc = String(variant.description ?? '').toUpperCase();

  // ── Fra features_json / raw_payload (booleans) ──
  const cameraPresent = boolInt(features.camera ?? raw.camera);
  const rainSensorPresent = boolInt(features.rainSensor ?? raw.rainSensor);
  const hudPresent = boolInt(features.hud ?? raw.hud);
  const heated = boolInt(features.heated ?? raw.heated);
  const acoustic = boolInt(features.acoustic ?? raw.acoustic);
  const antenna = boolInt(features.antenna ?? raw.antenna);
  const solar = boolInt(features.shade ?? raw.shade);

  // ── Fra description (heuristikk) ──
  const encapsulation = desc.includes('ENCAP') || desc.includes('INNKAPSL') ? 1 : 0;

  // ── ADAS / kalibrering ──
  const adasCalibrationRequired = boolInt(features.adas ?? raw.adas);
  const sensorInitializationRequired = rainSensorPresent;
  const hudVerificationRequired = hudPresent;

  // ── Mounting / post-install ──
  // Bakoverkompatibilitet: hvis mounting_json/post_install_json finnes i input,
  // bruk dem; ellers tomme objekter.
  const mountingJson = safeJson(variant.mounting_json ?? variant.mounting ?? {});
  const postInstallJson = safeJson(variant.post_install_json ?? variant.postInstall ?? {});

  // ── Fitment / match ──
  const fitmentRisk = variant.fitment_risk ?? 'medium';
  const matchType = variant.match_type ?? null;
  const matchScore = variant.match_score ?? null;
  const inputFile = variant.input_file ?? args.input ?? null;

  // ── Type-felter (tekst) ──
  const cameraType = variant.camera_type ?? null;
  const rainSensorMountType = variant.rain_sensor_mount_type ?? null;
  const adasCalibrationType = variant.adas_calibration_type ?? null;
  const hudCompatible = hudPresent; // forenklet: hvis HUD er til stede, anta kompatibel
  const heatedWiperPark = heated;   // forenklet

  return {
    mountingJson,
    postInstallJson,
    cameraPresent,
    cameraType,
    rainSensorPresent,
    rainSensorMountType,
    hudPresent,
    hudCompatible,
    heated,
    heatedWiperPark,
    acoustic,
    solar,
    antenna,
    encapsulation,
    adasCalibrationRequired,
    adasCalibrationType,
    sensorInitializationRequired,
    hudVerificationRequired,
    fitmentRisk,
    matchType,
    matchScore,
    inputFile,
  };
}

function featureSignature(features = {}) {
  return [
    `cam:${features.camera ? 1 : 0}`,
    `hud:${features.hud ? 1 : 0}`,
    `heat:${features.heated ? 1 : 0}`,
    `rain:${features.rainSensor ? 1 : 0}`,
    `acou:${features.acoustic ? 1 : 0}`,
    `ant:${features.antenna ? 1 : 0}`,
    `enc:${features.encapsulated ? 1 : 0}`,
    `sol:${features.solar ? 1 : 0}`,
  ].join('|');
}

function buildInsert(variant) {
  const sig = featureSignature(variant.features_json ?? variant.features ?? {});
  const allDefault = sig === 'cam:0|hud:0|heat:0|rain:0|acou:0|ant:0|enc:0|sol:0';
  const featureSig = allDefault ? 'default' : sig;
  const dedupeKey = [
    parseInt(variant.ktype, 10),
    variant.market ?? DEFAULT_MARKET,
    variant.source ?? 'import',
    variant.opening ?? 'unknown',
    featureSig,
  ].join('|');

  const s = extractSensorFields(variant);

  return [
    'INSERT INTO glass_variants',
    '  (ktype, market, source, opening, opening_raw, eurocode, oem_part_number,',
    '   article_number, description, feature_signature, features_json, raw_payload,',
    '   mounting_json, post_install_json,',
    '   camera_present, camera_type, rain_sensor_present, rain_sensor_mount_type,',
    '   hud_present, hud_compatible, heated, heated_wiper_park,',
    '   acoustic, solar, antenna, encapsulation,',
    '   adas_calibration_required, adas_calibration_type,',
    '   sensor_initialization_required, hud_verification_required,',
    '   fitment_risk, match_type, match_score, input_file, dedupe_key,',
    '   confidence, active, first_seen_at, last_seen_at, created_at, updated_at)',
    'VALUES (',
    `  ${parseInt(variant.ktype, 10)},`,
    `  ${esc(variant.market ?? DEFAULT_MARKET)},`,
    `  ${esc(variant.source ?? 'import')},`,
    `  ${esc(variant.opening ?? 'unknown')},`,
    `  ${esc(variant.opening_raw ?? variant.openingRaw ?? null)},`,
    `  ${esc(variant.eurocode ?? null)},`,
    `  ${esc(variant.oem_part_number ?? variant.oemPartNumber ?? null)},`,
    `  ${esc(variant.article_number ?? variant.articleNumber ?? null)},`,
    `  ${esc(variant.description ?? null)},`,
    `  ${esc(featureSig)},`,
    `  ${esc(JSON.stringify(variant.features_json ?? variant.features ?? {}))},`,
    `  ${esc(JSON.stringify(variant.raw_payload ?? variant.raw ?? {}))},`,
    `  ${esc(s.mountingJson)},`,
    `  ${esc(s.postInstallJson)},`,
    `  ${s.cameraPresent},`,
    `  ${esc(s.cameraType)},`,
    `  ${s.rainSensorPresent},`,
    `  ${esc(s.rainSensorMountType)},`,
    `  ${s.hudPresent},`,
    `  ${s.hudCompatible},`,
    `  ${s.heated},`,
    `  ${s.heatedWiperPark},`,
    `  ${s.acoustic},`,
    `  ${s.solar},`,
    `  ${s.antenna},`,
    `  ${s.encapsulation},`,
    `  ${s.adasCalibrationRequired},`,
    `  ${esc(s.adasCalibrationType)},`,
    `  ${s.sensorInitializationRequired},`,
    `  ${s.hudVerificationRequired},`,
    `  ${esc(s.fitmentRisk)},`,
    `  ${esc(s.matchType)},`,
    `  ${s.matchScore === null ? 'NULL' : s.matchScore},`,
    `  ${esc(s.inputFile)},`,
    `  ${esc(dedupeKey)},`,
    `  ${variant.confidence ?? DEFAULT_CONFIDENCE},`,
    '  1,',
    "  datetime('now'),",
    "  datetime('now'),",
    "  datetime('now'),",
    "  datetime('now')",
    ')',
    'ON CONFLICT(dedupe_key)',
    'DO UPDATE SET',
    '  description     = COALESCE(excluded.description, glass_variants.description),',
    '  feature_signature = excluded.feature_signature,',
    '  features_json   = excluded.features_json,',
    '  raw_payload     = excluded.raw_payload,',
    '  mounting_json   = excluded.mounting_json,',
    '  post_install_json = excluded.post_install_json,',
    '  camera_present  = MAX(excluded.camera_present, glass_variants.camera_present),',
    '  camera_type     = COALESCE(excluded.camera_type, glass_variants.camera_type),',
    '  rain_sensor_present = MAX(excluded.rain_sensor_present, glass_variants.rain_sensor_present),',
    '  rain_sensor_mount_type = COALESCE(excluded.rain_sensor_mount_type, glass_variants.rain_sensor_mount_type),',
    '  hud_present     = MAX(excluded.hud_present, glass_variants.hud_present),',
    '  hud_compatible  = MAX(excluded.hud_compatible, glass_variants.hud_compatible),',
    '  heated          = MAX(excluded.heated, glass_variants.heated),',
    '  heated_wiper_park = MAX(excluded.heated_wiper_park, glass_variants.heated_wiper_park),',
    '  acoustic        = MAX(excluded.acoustic, glass_variants.acoustic),',
    '  solar           = MAX(excluded.solar, glass_variants.solar),',
    '  antenna         = MAX(excluded.antenna, glass_variants.antenna),',
    '  encapsulation   = MAX(excluded.encapsulation, glass_variants.encapsulation),',
    '  adas_calibration_required = MAX(excluded.adas_calibration_required, glass_variants.adas_calibration_required),',
    '  adas_calibration_type = COALESCE(excluded.adas_calibration_type, glass_variants.adas_calibration_type),',
    '  sensor_initialization_required = MAX(excluded.sensor_initialization_required, glass_variants.sensor_initialization_required),',
    '  hud_verification_required = MAX(excluded.hud_verification_required, glass_variants.hud_verification_required),',
    '  fitment_risk    = excluded.fitment_risk,',
    '  match_type      = COALESCE(excluded.match_type, glass_variants.match_type),',
    '  match_score     = COALESCE(excluded.match_score, glass_variants.match_score),',
    '  input_file      = COALESCE(excluded.input_file, glass_variants.input_file),',
    '  confidence      = MAX(excluded.confidence, glass_variants.confidence),',
    "  last_seen_at    = datetime('now'),",
    "  updated_at      = datetime('now'),",
    '  active          = 1',
  ].join('\n');
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function runSql(sql, remote, tmpFile) {
  fs.writeFileSync(tmpFile, sql, 'utf8');
  const flag = remote ? '--remote' : '--local';
  const cmd = `npx wrangler d1 execute ${DB_NAME} ${flag} --file=${tmpFile} --yes`;
  execSync(cmd, { cwd: WRANGLER_DIR, stdio: 'pipe' });
}

function loadVariants(inputPath) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input-fil ikke funnet: ${inputPath}`);
  }
  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  // Format fra fetch-glass-variants-per-ktype.mjs:
  // { summary: {...}, records: [{ ktype, variants: [...] }] }
  if (raw.records && Array.isArray(raw.records)) {
    const variants = [];
    for (const record of raw.records) {
      for (const v of record.variants ?? []) {
        variants.push(v);
      }
    }
    return variants;
  }

  // Flat array-format:
  if (Array.isArray(raw)) return raw;

  throw new Error('Ukjent JSON-format i input-fil. Forventet { records: [...] } eller flat array.');
}

function validate(variant, index) {
  const id = `variant[${index}]`;
  const ktype = parseInt(variant.ktype, 10);
  if (!ktype || isNaN(ktype)) throw new Error(`${id}: ugyldig ktype: ${variant.ktype}`);
  if (!variant.opening) throw new Error(`${id} ktype=${ktype}: mangler opening`);
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Import glass variants → D1 glass_variants (v0009)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Input:     ${args.input}`);
  console.log(`DB:        ${DB_NAME}`);
  console.log(`Modus:     ${args.remote ? 'REMOTE (prod)' : 'LOCAL (dev)'}`);
  console.log(`Dry run:   ${args.dryRun ? 'ja' : 'nei'}`);
  console.log(`Chunk:     ${CHUNK_SIZE} per kall`);
  console.log('');

  // Last inn varianter
  let variants;
  try {
    variants = loadVariants(path.resolve(args.input));
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  if (variants.length === 0) {
    console.warn('⚠️  Ingen varianter å importere.');
    return;
  }

  // Valider og filtrer
  const valid = [];
  const invalid = [];
  for (let i = 0; i < variants.length; i++) {
    try {
      validate(variants[i], i);
      valid.push(variants[i]);
    } catch (err) {
      invalid.push({ index: i, error: err.message });
    }
  }

  console.log(`✅ Gyldige:    ${valid.length}`);
  if (invalid.length > 0) {
    console.warn(`⚠️  Ugyldige:  ${invalid.length}`);
    for (const e of invalid.slice(0, 10)) console.warn(`   ${e.error}`);
    if (invalid.length > 10) console.warn(`   ... og ${invalid.length - 10} til`);
  }
  console.log('');

  if (args.dryRun) {
    console.log('🔍 Dry run — første 3 INSERT-er:');
    for (const v of valid.slice(0, 3)) {
      console.log('─'.repeat(60));
      console.log(buildInsert(v));
    }
    console.log('─'.repeat(60));
    console.log(`\n✅ Dry run fullført. Ingen data skrevet.`);
    return;
  }

  // Splitt i chunks og kjør
  const chunks = chunk(valid, CHUNK_SIZE);
  const tmpFile = path.join(os.tmpdir(), `glass-variants-import-${Date.now()}.sql`);
  let totalInserted = 0;
  let totalFailed = 0;

  for (let ci = 0; ci < chunks.length; ci++) {
    const c = chunks[ci];
    process.stdout.write(`  Chunk ${ci + 1}/${chunks.length} (${c.length} rader) ... `);

    const statements = c.map(v => buildInsert(v)).join(';\n\n') + ';';

    try {
      runSql(statements, args.remote, tmpFile);
      totalInserted += c.length;
      console.log('OK');
    } catch (err) {
      totalFailed += c.length;
      console.log(`FAIL`);
      console.error(`  → ${err.message?.split('\n')[0]}`);

      if (args.verbose) {
        // Ved feil: prøv én og én for å finne raden som krasjer
        console.log('  Prøver enkeltvis ...');
        for (const v of c) {
          const single = buildInsert(v) + ';';
          try {
            runSql(single, args.remote, tmpFile);
            totalInserted++;
            totalFailed--;
          } catch (e2) {
            console.error(`    ❌ ktype=${v.ktype} opening=${v.opening}: ${e2.message?.split('\n')[0]}`);
          }
        }
      }
    }
  }

  // Rydd tmp-fil
  try { fs.unlinkSync(tmpFile); } catch {}

  // Verifiser count i DB
  let dbCount = null;
  try {
    const flag = args.remote ? '--remote' : '--local';
    const out = execSync(
      `npx wrangler d1 execute ${DB_NAME} ${flag} --command="SELECT COUNT(*) as cnt FROM glass_variants" --yes`,
      { cwd: WRANGLER_DIR, encoding: 'utf8', stdio: 'pipe' }
    );
    const match = out.match(/"cnt":\s*(\d+)/);
    if (match) dbCount = parseInt(match[1], 10);
  } catch {}

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Oppsummering');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`✅ Importert:  ${totalInserted}`);
  if (totalFailed > 0) console.log(`❌ Feilet:    ${totalFailed}`);
  if (dbCount !== null) console.log(`🗄️  DB totalt:  ${dbCount} rader i glass_variants`);

  if (totalFailed > 0) {
    console.log('\n⚠️  Kjør med --verbose for enkeltvis feilsøking.');
    process.exitCode = 2;
  } else {
    console.log('\n🎉 Import fullført!');
  }
}

main().catch(err => {
  console.error('💥 Fatal:', err.message);
  process.exit(1);
});

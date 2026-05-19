/**
 * Autoglass AS — D1 Frontrute Data Enrichment
 * ============================================
 * Parser year_from/year_to, brand, og equipment-flagg fra description
 * og oppdaterer D1-tabellen glass_catalog.
 *
 * Kjør: node scripts/enrich-d1-frontruter.mjs
 */

import { execSync } from 'child_process';

const WRANGLER = 'cd api/cf-worker && npx wrangler';
const DB_NAME = 'glass-catalog-db';

// ── Helpers ────────────────────────────────────────────────────────────────

function parseYearFromDescription(desc) {
  if (!desc) return { from: null, to: null };

  // Match patterns:
  // "2015;" or "2015 " -> single year
  // "07/2012;" or "12/2015" -> month/year
  // "2012-" -> from year only
  // "2010-2015;" -> year range
  // "90-03-" -> 2-digit years

  // Month/year like "07/2012" or "12/2015"
  const mMonthYear = desc.match(/(\d{2})\/(\d{4})/);
  if (mMonthYear) {
    return { from: parseInt(mMonthYear[2], 10), to: null };
  }

  // Year range like "2010-2015" or "2010-2015;"
  const mRange = desc.match(/(\d{4})\s*[-–]\s*(\d{4})/);
  if (mRange) {
    return { from: parseInt(mRange[1], 10), to: parseInt(mRange[2], 10) };
  }

  // Single year followed by semicolon, space, or end
  const mSingle = desc.match(/(\d{4})\s*[;\s)]/);
  if (mSingle) {
    return { from: parseInt(mSingle[1], 10), to: null };
  }

  // Single year at end of string
  const mEnd = desc.match(/(\d{4})\s*$/);
  if (mEnd) {
    return { from: parseInt(mEnd[1], 10), to: null };
  }

  // 2-digit year range like "90-03-" or "90-03 "
  const m2Digit = desc.match(/(\d{2})\s*[-–]\s*(\d{2})\s*[-;\s)]/);
  if (m2Digit) {
    let from = parseInt(m2Digit[1], 10);
    let to = parseInt(m2Digit[2], 10);
    if (from < 50) from += 2000; else if (from < 100) from += 1900;
    if (to < 50) to += 2000; else if (to < 100) to += 1900;
    return { from, to };
  }

  return { from: null, to: null };
}

function parseEquipmentFromDescription(desc) {
  if (!desc) return { adas: 0, rain_sensor: 0, heated: 0, acoustic: 0, antenna: 0, hud: 0, camera: 0 };
  const d = desc.toUpperCase();
  return {
    adas: /\b(ADAS|LANE ASSIST|COLLISION|AUTO BRAKE|FILSKIFTE)\b/.test(d) ? 1 : 0,
    rain_sensor: /\b(RSN|RSNL|RSNLSN|RAIN SENSOR|REGN SENSOR|VINDRUTETORKARE)\b/.test(d) ? 1 : 0,
    heated: /\b(HTD|HEATED|OPPVARM|VARME|DEFROST)\b/.test(d) ? 1 : 0,
    acoustic: /\b(ACO|ACOUSTIC|AKUSTISK|QUIET|STØYDEMP)\b/.test(d) ? 1 : 0,
    antenna: /\b(ANT|ANTENNA|ANTENNE|GPS|RADIO|FM|DAB)\b/.test(d) ? 1 : 0,
    hud: /\b(HUD|HEAD.UP|PROJEKSJON)\b/.test(d) ? 1 : 0,
    camera: /\b(CAMERA|CAM|KAMERA|SENSOR)\b/.test(d) ? 1 : 0,
  };
}

function parseBrandFromDescription(desc, existingBrand) {
  if (existingBrand && existingBrand.trim() !== '' && existingBrand !== 'Ukjent' && existingBrand !== 'Annet') {
    return null; // Already has brand
  }
  if (!desc) return null;
  const d = desc.toUpperCase();
  const brands = [
    'ALFA ROMEO', 'ASTON MARTIN', 'AUDI', 'BENTLEY', 'BMW', 'CHEVROLET',
    'CHRYSLER', 'CITROEN', 'DACIA', 'DAEWOO', 'DAIHATSU', 'DODGE', 'DS',
    'FIAT', 'FORD', 'HONDA', 'HYUNDAI', 'INFINITI', 'ISUZU', 'IVECO',
    'JAGUAR', 'JEEP', 'KIA', 'LADA', 'LAMBORGHINI', 'LANCIA', 'LAND ROVER',
    'LEXUS', 'LOTUS', 'MASERATI', 'MAZDA', 'MERCEDES-BENZ', 'MERCEDES',
    'MG', 'MINI', 'MITSUBISHI', 'NISSAN', 'OPEL', 'PEUGEOT', 'PORSCHE',
    'RENAULT', 'SAAB', 'SEAT', 'SKODA', 'SMART', 'SSANGYONG', 'SUBARU',
    'SUZUKI', 'TESLA', 'TOYOTA', 'VOLKSWAGEN', 'VW', 'VOLVO',
  ];
  for (const brand of brands) {
    if (d.includes(brand)) return brand;
  }
  return null;
}

function runSql(sql) {
  const cmd = `${WRANGLER} d1 execute ${DB_NAME} --remote --command "${sql.replace(/"/g, '\\"')}" 2>/dev/null`;
  try {
    const out = execSync(cmd, { encoding: 'utf-8', cwd: '/Users/taj/bilglass', maxBuffer: 50 * 1024 * 1024 });
    return out;
  } catch (e) {
    console.error('SQL error:', e.stderr || e.message);
    return null;
  }
}

function fetchRows(sql) {
  const out = runSql(sql);
  if (!out) return [];
  try {
    // Find JSON array in output
    const start = out.indexOf('[');
    const end = out.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) return [];
    const parsed = JSON.parse(out.slice(start, end + 1));
    return parsed[0]?.results || [];
  } catch (e) {
    console.error('Parse error:', e.message);
    return [];
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 Henter alle frontruter fra D1...');
  const rows = fetchRows(`SELECT id, eurocode, brand, description FROM glass_catalog WHERE category = 'frontrute'`);
  console.log(`   Funnet ${rows.length} frontruter`);

  let yearUpdates = 0;
  let brandUpdates = 0;
  let equipUpdates = 0;

  const BATCH_SIZE = 50;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const sqls = [];

    for (const r of batch) {
      const updates = [];

      // Parse year
      const yr = parseYearFromDescription(r.description);
      if (yr.from !== null) {
        updates.push(`year_from = ${yr.from}`);
        if (yr.to !== null) updates.push(`year_to = ${yr.to}`);
        yearUpdates++;
      }

      // Parse brand
      const brand = parseBrandFromDescription(r.description, r.brand);
      if (brand) {
        updates.push(`brand = '${brand.replace(/'/g, "''")}'`);
        brandUpdates++;
      }

      // Parse equipment
      const eq = parseEquipmentFromDescription(r.description);
      // Only update if description suggests different values than current
      // We update all to be safe
      updates.push(`adas = ${eq.adas}`);
      updates.push(`rain_sensor = ${eq.rain_sensor}`);
      updates.push(`heated = ${eq.heated}`);
      updates.push(`acoustic = ${eq.acoustic}`);
      updates.push(`antenna = ${eq.antenna}`);
      updates.push(`hud = ${eq.hud}`);
      updates.push(`camera = ${eq.camera}`);
      equipUpdates++;

      if (updates.length > 0) {
        sqls.push(`UPDATE glass_catalog SET ${updates.join(', ')} WHERE id = ${r.id}`);
      }
    }

    if (sqls.length > 0) {
      const combined = sqls.join('; ');
      runSql(combined);
      console.log(`   Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rows.length / BATCH_SIZE)}: oppdatert ${sqls.length} rader`);
    }
  }

  console.log('\n✅ Enrichment fullført!');
  console.log(`   year_from/year_to parsed: ${yearUpdates}`);
  console.log(`   brand fikset: ${brandUpdates}`);
  console.log(`   equipment-flagg oppdatert: ${equipUpdates}`);
}

main().catch(console.error);

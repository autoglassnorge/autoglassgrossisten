import { promises as fs } from 'fs';

const BOVSOFT_URL = 'http://ns3115634.ip-54-38-179.eu:150/bovsoft.regnum.run';
const CLIENT_ID = '461';
const SECCODE = '726443558cec51db0e2d5ae5286d32df';
const DELAY_MS = 3000;

async function bovsoftLookup(regnr) {
  try {
    const url = `${BOVSOFT_URL}?id=${encodeURIComponent(CLIENT_ID)}&seccode=${encodeURIComponent(SECCODE)}&nameservice=getktypefornumplatenorway&regnum=${encodeURIComponent(regnr)}&contenttype=JSON`;
    const resp = await fetch(url, { method: 'GET' });
    const data = await resp.json();
    return { regnr, ok: data.status === 200, data };
  } catch (e) {
    return { regnr, ok: false, error: e.message };
  }
}

async function main() {
  const allRegnrs = JSON.parse(await fs.readFile('/tmp/bovsoft-all-regnrs.json', 'utf-8'));
  const targets = JSON.parse(await fs.readFile('/tmp/bovsoft-final-batch.json', 'utf-8'));

  console.log(`Processing ${allRegnrs.length} regnrs with Bovsoft (${DELAY_MS}ms delay)...`);
  const results = [];
  let creditsRemaining = null;

  for (let i = 0; i < allRegnrs.length; i++) {
    const regnr = allRegnrs[i];
    const r = await bovsoftLookup(regnr);
    results.push(r);
    if (r.ok && r.data?.data?.datacar?.[0]) {
      const car = r.data.data.datacar[0];
      const ktype = parseInt(car.ktype, 10);
      const brand = car.manufCar;
      const model = car.modelCar;
      const yearFrom = car.typeFromYearCar ? parseInt(String(car.typeFromYearCar).slice(0,4), 10) : null;
      console.log(`  [${i+1}/${allRegnrs.length}] ${regnr} → kType ${ktype} | ${brand} ${model} (${yearFrom})`);
    } else if (r.data?.status === 404) {
      console.log(`  [${i+1}/${allRegnrs.length}] ${regnr} → 404 (unknown regnr)`);
    } else if (r.data?.status === 402) {
      console.log(`  [${i+1}/${allRegnrs.length}] ${regnr} → 402 (zero balance!)`);
      break;
    } else {
      console.log(`  [${i+1}/${allRegnrs.length}] ${regnr} → FAILED: status=${r.data?.status} ${r.error || ''}`);
    }
    if (typeof r.data?.countFREERequests === 'number') {
      creditsRemaining = r.data.countFREERequests;
    }
    if (i < allRegnrs.length - 1) {
      await new Promise(res => setTimeout(res, DELAY_MS));
    }
  }

  // Save raw results
  await fs.writeFile('/tmp/bovsoft-bulk-results.json', JSON.stringify(results, null, 2));

  // Build ktype_matches format
  const mappings = [];
  for (const r of results) {
    if (!r.ok || !r.data?.data?.datacar?.[0]) continue;
    const car = r.data.data.datacar[0];
    const yearFrom = car.typeFromYearCar ? parseInt(String(car.typeFromYearCar).slice(0,4), 10) : null;
    const yearTo = car.typeToYearCar ? parseInt(String(car.typeToYearCar).slice(0,4), 10) : null;
    mappings.push({
      regnr: r.regnr,
      ktype: parseInt(car.ktype, 10),
      brand: car.manufCar || null,
      model: car.modelCar || null,
      year_from: yearFrom,
      year_to: yearTo,
      country_code: 'NO',
      source: 'bovsoft_bulk_finn',
      created_at: new Date().toISOString(),
    });
  }

  await fs.writeFile('/tmp/bovsoft-bulk-mappings.json', JSON.stringify(mappings, null, 2));

  // Summary
  console.log(`\n=== BULK BOVSOFT RESULTS ===`);
  console.log(`Total regnrs: ${allRegnrs.length}`);
  console.log(`Successful kType lookups: ${mappings.length}`);
  console.log(`Failed: ${allRegnrs.length - mappings.length}`);
  console.log(`Credits remaining: ${creditsRemaining}`);

  // Per-model summary
  let idx = 0;
  for (const t of targets) {
    const modelMappings = mappings.filter(m => {
      const pos = allRegnrs.indexOf(m.regnr);
      return pos >= idx && pos < idx + t.regnrs.length;
    });
    const uniqueKtypes = [...new Set(modelMappings.map(m => m.ktype))];
    console.log(`  ${t.model}: ${modelMappings.length}/${t.regnrs.length} with kType, unique kTypes: [${uniqueKtypes.join(', ')}]`);
    idx += t.regnrs.length;
  }

  // Generate SQL for ktype_matches
  if (mappings.length > 0) {
    const values = mappings.map(m =>
      `('${m.regnr}', ${m.ktype}, ${m.brand ? `'${m.brand.replace(/'/g, "''")}'` : 'NULL'}, ${m.model ? `'${m.model.replace(/'/g, "''")}'` : 'NULL'}, ${m.year_from || 'NULL'}, ${m.year_to || 'NULL'}, 'NO', '${m.source}', datetime('now'))`
    ).join(',\n  ');
    const sql = `INSERT OR REPLACE INTO ktype_matches (regnr, ktype, brand, model, year_from, year_to, country_code, source, created_at) VALUES\n  ${values};`;
    await fs.writeFile('/tmp/bovsoft-bulk-inserts.sql', sql);
    console.log(`\nSQL generated: /tmp/bovsoft-bulk-inserts.sql (${mappings.length} inserts)`);
  }
}

main().catch(console.error);

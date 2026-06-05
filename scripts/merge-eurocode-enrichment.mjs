#!/usr/bin/env node
/**
 * Merge eurocode + property enrichment from autoglass-by-eurocode.json into catalog-prod.json
 *
 * Sources:
 *   - data/catalog-prod.json (target) — 27,184 records
 *   - data/autoglass-by-eurocode.json (source) — 20,504 entries keyed by eurocode/article_number
 *
 * Output:
 *   - data/catalog-prod.json (overwritten with enriched data)
 *   - data/catalog-enrichment-report.json (audit trail)
 */

import fs from 'fs';
import path from 'path';

const CATALOG_PATH = 'data/catalog-prod.json';
const SOURCE_PATH = 'data/autoglass-by-eurocode.json';
const REPORT_PATH = 'data/catalog-enrichment-report.json';

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function main() {
  console.log('=== Eurocode Enrichment Merge ===\n');

  const catalog = loadJson(CATALOG_PATH);
  const source = loadJson(SOURCE_PATH);

  if (!catalog.records || !Array.isArray(catalog.records)) {
    throw new Error('catalog-prod.json missing .records array');
  }

  // Build lookup: article_number → source entry
  const byArticle = new Map();
  const byTitle = new Map();
  for (const [key, entry] of Object.entries(source)) {
    // key is often the eurocode itself for 18,256 entries
    byArticle.set(key, entry);
    if (entry.title) {
      byTitle.set(entry.title.toUpperCase().trim(), entry);
    }
  }

  let enriched = 0;
  let eurocodeFilled = 0;
  let propertiesAdded = 0;
  let typeCodeDescAdded = 0;
  let unchanged = 0;
  const stillMissing = [];

  for (const record of catalog.records) {
    const article = record.article_number;
    let src = byArticle.get(article);

    if (!src && record.description) {
      src = byTitle.get(record.description.toUpperCase().trim());
    }

    if (!src) {
      unchanged++;
      if (!record.eurocode) {
        stillMissing.push({
          article_number: article,
          brand: record.brand,
          model: record.model,
          description: record.description,
          reason: 'no_source_match'
        });
      }
      continue;
    }

    let modified = false;

    // Fill eurocode
    if (!record.eurocode && src.eurocode) {
      record.eurocode = src.eurocode;
      eurocodeFilled++;
      modified = true;
    }

    // Add properties (ADAS, sensors, etc.)
    if (src.properties && !record.properties) {
      record.properties = src.properties;
      propertiesAdded++;
      modified = true;
    }

    // Add type_description if missing or generic
    if (src.typeCodeDesc && (!record.type_description || record.type_description === record.type_code)) {
      record.type_description = src.typeCodeDesc;
      typeCodeDescAdded++;
      modified = true;
    }

    // Add source_url if missing
    if (src.sourceUrl && !record.source_url) {
      record.source_url = src.sourceUrl;
      modified = true;
    }

    if (modified) enriched++;
    else unchanged++;
  }

  // Update metadata
  const now = new Date().toISOString();
  catalog.meta = catalog.meta || {};
  catalog.meta.last_enriched = now;
  catalog.meta.enrichment_source = 'autoglass-by-eurocode.json';
  catalog.meta.enrichment_version = '1.0';

  const totalWithEuro = catalog.records.filter(r => r.eurocode).length;
  const totalMissing = catalog.records.length - totalWithEuro;

  const report = {
    timestamp: now,
    source_file: SOURCE_PATH,
    target_file: CATALOG_PATH,
    stats: {
      total_records: catalog.records.length,
      enriched_records: enriched,
      unchanged_records: unchanged,
      eurocode_filled: eurocodeFilled,
      properties_added: propertiesAdded,
      type_code_desc_added: typeCodeDescAdded,
      total_with_eurocode: totalWithEuro,
      total_missing_eurocode: totalMissing,
      eurocode_coverage_percent: ((totalWithEuro / catalog.records.length) * 100).toFixed(2)
    },
    still_missing: stillMissing.slice(0, 100), // cap report size
    sample_enriched: catalog.records
      .filter(r => r.properties)
      .slice(0, 5)
      .map(r => ({
        article_number: r.article_number,
        eurocode: r.eurocode,
        brand: r.brand,
        model: r.model,
        properties: r.properties
      }))
  };

  saveJson(CATALOG_PATH, catalog);
  saveJson(REPORT_PATH, report);

  console.log('Enrichment complete!\n');
  console.log(`  Total records:        ${report.stats.total_records}`);
  console.log(`  Enriched:             ${report.stats.enriched_records}`);
  console.log(`  Unchanged:            ${report.stats.unchanged_records}`);
  console.log(`  Eurocode filled:      ${report.stats.eurocode_filled}`);
  console.log(`  Properties added:     ${report.stats.properties_added}`);
  console.log(`  TypeDesc added:       ${report.stats.type_code_desc_added}`);
  console.log(`  ──────────────────────────────────────`);
  console.log(`  With eurocode:        ${report.stats.total_with_eurocode}`);
  console.log(`  Still missing:        ${report.stats.total_missing_eurocode}`);
  console.log(`  Coverage:             ${report.stats.eurocode_coverage_percent}%`);
  console.log(`\nFiles written:`);
  console.log(`  ${CATALOG_PATH}`);
  console.log(`  ${REPORT_PATH}`);
}

main();

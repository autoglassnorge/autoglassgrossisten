#!/usr/bin/env node
/**
 * Autoglass MCP-server — Prosjekt-spesifikke verktøy for Autoglass AS
 * ================================================================
 * Zero-dependency Node.js MCP-server som eksponerer 6 verktøy:
 *   1. deploy_status       — Sjekk Worker, KV, D1, Pages status
 *   2. run_smoke_test      — Post-deploy verifisering
 *   3. catalog_quality     — Data-kvalitets-gate
 *   4. ktype_coverage      — kType-dekning rapport
 *   5. search_ground_truth — Test regnr mot alle lag
 *   6. price_sync_status   — Siste pris-synkronisering
 *
 * Autoglass AS — selvstendig, ingen avhengighet til Klarpakke
 */

import { createInterface } from 'readline';
import { spawn } from 'child_process';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

/* ── MCP Protocol ─────────────────────────────────────────── */

const serverInfo = { name: 'autoglass-mcp', version: '1.0.0' };
const initResult = {
  protocolVersion: '2024-11-05',
  capabilities: { tools: {} },
  serverInfo,
};

const tools = [
  {
    name: 'deploy_status',
    description: 'Sjekk deploy-status for Worker, KV, D1 og Pages. Returnerer health, catalogSize, D1-tabeller, og Pages-tilgjengelighet.',
    inputSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Worker base URL', default: 'https://autoglass-glass-sok.autoglassnorge.workers.dev' },
        pagesUrl: { type: 'string', description: 'Pages URL', default: 'https://autoglass-frontend.pages.dev' }
      }
    }
  },
  {
    name: 'run_smoke_test',
    description: 'Kjør smoke-test suite mot produksjon eller staging. Sjekker health, regnr-oppslag, prefix4, eurocode, CORS.',
    inputSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Worker base URL', default: 'https://autoglass-glass-sok.autoglassnorge.workers.dev' }
      }
    }
  },
  {
    name: 'catalog_quality',
    description: 'Valider data/catalog-prod.json mot kvalitets-gate: ≥30k poster, eurocode-dekning, brand-dekning, prefix4-dekning, duplikater.',
    inputSchema: {
      type: 'object',
      properties: {
        catalogPath: { type: 'string', description: 'Sti til katalog-fil', default: 'data/catalog-prod.json' }
      }
    }
  },
  {
    name: 'ktype_coverage',
    description: 'Rapporter kType-dekning fra D1: antall ktyper i registry, glass_rules, ktype_matches, og kType-mappede produkter.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'search_ground_truth',
    description: 'Test kjente regnr mot alle matching-lag. Verifiserer at Layer 0 (kType), Layer 0.5 (TecDoc), og Layer 1-3 fungerer.',
    inputSchema: {
      type: 'object',
      properties: {
        regnr: { type: 'string', description: 'Registreringsnummer å teste', default: 'SU18018' },
        baseUrl: { type: 'string', description: 'Worker base URL', default: 'https://autoglass-glass-sok.autoglassnorge.workers.dev' }
      }
    }
  },
  {
    name: 'price_sync_status',
    description: 'Sjekk når pris-synkronisering sist ble kjørt. Sjekker git log og fil-timestamps.',
    inputSchema: { type: 'object', properties: {} }
  }
];

const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
const rl = createInterface({ input: process.stdin, terminal: false });

/* ── Tool Handlers ────────────────────────────────────────── */

async function handleDeployStatus(args) {
  const baseUrl = args.baseUrl || 'https://autoglass-glass-sok.autoglassnorge.workers.dev';
  const pagesUrl = args.pagesUrl || 'https://autoglass-frontend.pages.dev';
  const results = { worker: null, pages: null, d1: null, timestamp: new Date().toISOString() };

  // Worker health
  try {
    const res = await fetch(`${baseUrl}/api/health`);
    const data = await res.json();
    results.worker = { ok: res.ok, status: data.status, catalogSize: data.catalogSize, responseTime: res.headers.get('cf-ray') ? 'edge' : 'unknown' };
  } catch (e) {
    results.worker = { ok: false, error: e.message };
  }

  // Pages
  try {
    const res = await fetch(pagesUrl);
    results.pages = { ok: res.ok, status: res.status };
  } catch (e) {
    results.pages = { ok: false, error: e.message };
  }

  // D1 (via wrangler)
  try {
    const d1Result = await runCommand('npx', ['wrangler', 'd1', 'execute', 'glass-catalog-db', '--local', '--command=SELECT COUNT(*) as c FROM ktype_registry UNION ALL SELECT COUNT(*) FROM glass_rules UNION ALL SELECT COUNT(*) FROM ktype_matches UNION ALL SELECT COUNT(*) FROM glass_catalog WHERE ktype IS NOT NULL'], { cwd: resolve(ROOT, 'api/cf-worker') });
    results.d1 = { raw: d1Result.stdout };
  } catch (e) {
    results.d1 = { error: e.message };
  }

  return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
}

async function handleSmokeTest(args) {
  const baseUrl = args.baseUrl || 'https://autoglass-glass-sok.autoglassnorge.workers.dev';
  try {
    const result = await runCommand('node', ['scripts/smoke-test.mjs', `--base=${baseUrl}`], { cwd: ROOT });
    return { content: [{ type: 'text', text: `✅ Smoke-test PASS\n\n${result.stdout}\n${result.stderr}` }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `❌ Smoke-test FAIL\n\n${e.stdout}\n${e.stderr}` }], isError: true };
  }
}

async function handleCatalogQuality(args) {
  const catalogPath = args.catalogPath || 'data/catalog-prod.json';
  try {
    const result = await runCommand('node', ['scripts/validate-catalog.mjs', resolve(ROOT, catalogPath)], { cwd: ROOT });
    return { content: [{ type: 'text', text: `✅ Kvalitets-gate\n\n${result.stdout}\n${result.stderr}` }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `❌ Kvalitets-gate BLOCK\n\n${e.stdout}\n${e.stderr}` }], isError: true };
  }
}

async function handleKtypeCoverage() {
  try {
    const result = await runCommand('npx', ['wrangler', 'd1', 'execute', 'glass-catalog-db', '--local', '--command=SELECT "ktype_registry" as t, COUNT(*) as c FROM ktype_registry UNION ALL SELECT "glass_rules", COUNT(*) FROM glass_rules UNION ALL SELECT "ktype_matches", COUNT(*) FROM ktype_matches UNION ALL SELECT "tecdoc_ktype_registry", COUNT(*) FROM tecdoc_ktype_registry UNION ALL SELECT "glass_catalog_with_ktype", COUNT(*) FROM glass_catalog WHERE ktype IS NOT NULL'], { cwd: resolve(ROOT, 'api/cf-worker') });
    return { content: [{ type: 'text', text: `📊 kType-dekning\n\n${result.stdout}` }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `⚠️ kType-dekning (feil): ${e.message}\n${e.stdout || ''}` }], isError: true };
  }
}

async function handleSearchGroundTruth(args) {
  const regnr = args.regnr || 'SU18018';
  const baseUrl = args.baseUrl || 'https://autoglass-glass-sok.autoglassnorge.workers.dev';

  try {
    const res = await fetch(`${baseUrl}/api/glass?regnr=${regnr}`);
    const data = await res.json();
    const summary = {
      regnr,
      status: res.status,
      vehicle: data.vehicle || null,
      candidateCount: data.candidates?.length || 0,
      confidence: data.confidence || null,
      layer: data.layer || 'unknown',
      errors: data.error ? [data.error] : []
    };
    return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `❌ Feil ved oppslag: ${e.message}` }], isError: true };
  }
}

async function handlePriceSyncStatus() {
  const checks = [];

  // Sjekk git log for price-sync
  try {
    const gitResult = await runCommand('git', ['log', '-1', '--format=%h|%s|%ai', '--', 'data/catalog-prod.json'], { cwd: ROOT });
    if (gitResult.stdout.trim()) {
      const [hash, subject, date] = gitResult.stdout.trim().split('|');
      checks.push(`Siste katalog-commit: ${hash} — ${subject} (${date})`);
    }
  } catch { /* ignore */ }

  // Sjekk timestamp på catalog-prod.json
  const catalogPath = resolve(ROOT, 'data/catalog-prod.json');
  if (existsSync(catalogPath)) {
    const stat = statSync(catalogPath);
    checks.push(`catalog-prod.json sist endret: ${stat.mtime.toISOString()}`);
  }

  // Sjekk om price-sync-scripts finnes
  const syncScript = resolve(ROOT, 'scripts/sync-prices-to-catalog.mjs');
  if (existsSync(syncScript)) {
    checks.push(`Price-sync script: tilgjengelig`);
  }

  return { content: [{ type: 'text', text: `💰 Pris-synkronisering\n\n${checks.join('\n')}` }] };
}

/* ── Helpers ──────────────────────────────────────────────── */

function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, env: { ...process.env, ...opts.env } });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', d => stdout += d);
    child.stderr?.on('data', d => stderr += d);
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject({ stdout, stderr, code });
    });
    child.on('error', err => reject({ stdout, stderr, error: err.message }));
  });
}

/* ── Main Loop ────────────────────────────────────────────── */

rl.on('line', async (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;

  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: initResult });
  } else if (method === 'notifications/initialized') {
    // no-op
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools } });
  } else if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments || {};
    let result;

    try {
      switch (name) {
        case 'deploy_status': result = await handleDeployStatus(args); break;
        case 'run_smoke_test': result = await handleSmokeTest(args); break;
        case 'catalog_quality': result = await handleCatalogQuality(args); break;
        case 'ktype_coverage': result = await handleKtypeCoverage(); break;
        case 'search_ground_truth': result = await handleSearchGroundTruth(args); break;
        case 'price_sync_status': result = await handlePriceSyncStatus(); break;
        default:
          send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } });
          return;
      }
      send({ jsonrpc: '2.0', id, result });
    } catch (e) {
      send({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message || 'Internal error' } });
    }
  } else {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  }
});

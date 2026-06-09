#!/usr/bin/env node
/**
 * 🏛️ MemPalace MCP Server v3.5.0 — KIMI Code 0.11.0 Optimalisert
 *
 * Fikser i v3.5.0:
 * - Output truncation: respekterer KIMI CLI v1.32.0+ 100K tool-output cap
 *   (truncateOutput sikrer at resultater alltid er under ~80K tegn)
 * - 0.11.0-aware: oppdatert for max_steps_per_turn=750, show_thinking_stream, sub-skill discovery
 * - Forbedret get_status med server-metrikker og cap-warning
 * - Versjon-agnostisk: støtter både v1.44 alias-resolution og v1.43 OAuth
 *
 * Fikser i v3.4.0:
 * - Atomic writes: index-cache og KG compaction skrives atomisk (tmp + rename)
 * - KG backup: kg.json sikkerhetskopieres før compaction
 * - File watcher: 2s debounce, kun Knowledge/Handoffs/Docs
 * - Optimalisert cacheSize 100 og maxResultChars 600 for token-effektivitet
 * - Diary chunking: lange diary-linjer splittes i sub-docs
 * - Graceful shutdown med timeout
 *
 * Fikser i v3.3.0 (SuperKIMI):
 * - Bigram index: frase-match-scoring for fler-ords-søk ("KIMI CLI" > "KIMI" + "CLI")
 * - Ekte TF-IDF: inverse document frequency vekting (sjeldne tokens scorer høyere)
 * - Index persistens: lagrer inverted index til disk for <100ms oppstart
 * - Stemming: enkle norske/engelske regler (optimalisering → optimal)
 * - Bedre snippets: kontekst-ekstraksjon rundt matchende tokens
 * - Cross-lingual expansions: norsk↔engelsk synonym-mapping
 * - Forbedret auto_tag: semantiske tags fra KG + expansions, ikke bare filnavn
 * - Forbedret semanticSearch: scorer og ranker resultater
 * - File watcher: fs.watch for inkrementell reindex ved runtime-endringer
 * - Kontekst-vennlig: optimeret for 262k k2.6 + 750 steps/turn
 *
 * Fikser i v3.2.0:
 * - Inverted index for O(1) token lookup
 * - MCP Resources/Prompts/Logging
 * - Incremental KG writes + auto-compact
 * - Ekte semantic_search med KG-basert synonym-ekspansjon
 * - Auto-reindex basert på mtime
 *
 * Versjon: 3.5.0
 * Dato: 2026-05-27
 * For: KIMI Code 0.11.0, k2.6, macOS ARM64
 */

import {
  readFileSync, existsSync, readdirSync, statSync,
  writeFileSync, mkdirSync, appendFileSync, watch, unlinkSync, renameSync
} from 'fs';
import { resolve, join, dirname, relative, basename } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync, gunzipSync } from 'zlib';
import { queryCache } from './lib/query-cache.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '../..');

function envFlag(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

// ─── KONFIGURASJON ───
const CONFIG = {
  version: '3.5.0',
  wing: 'autoglass',
  cacheSize: 100,           // redusert fra 500 — tilstrekkelig for Bilglass-prosjektet
  maxResultChars: 600,      // redusert fra 2500 — fokus på mest relevante kontekst
  maxToolOutputChars: 20000, // redusert fra 75000 — ~8% av 262K kontekst, gir headroom
  batchSize: 50,
  kgBatchSize: 100,
  indexCachePath: '.kimi/mempalace/data/index-cache-v3.json',
  enableFileWatcher: envFlag('MEMPALACE_ENABLE_FILE_WATCHER', !envFlag('MEMPALACE_DISABLE_FILE_WATCHER', false)),   // PÅ med smart debounce, men kan skrus av i Codex
  fileWatcherPaths: ['docs', '.kimi/mempalace/rooms', '.kimi/plans'], // kun disse paths
  fileWatcherDebounceMs: 2000, // 2s debounce for å unngå reindex-storm
  indexPaths: [
    { path: 'docs', label: 'Docs', types: ['md'] },
    { path: '.kimi', label: 'Diary', include: ['diary.jsonl'] },
    { path: '.kimi/mempalace/rooms/Knowledge', label: 'Knowledge', types: ['md', 'txt'] },
    { path: '.kimi/mempalace/rooms/Docs', label: 'Docs', types: ['md', 'txt'] },
    { path: '.kimi/mempalace/rooms/Handoffs', label: 'Handoffs', types: ['md'] },
    { path: '.kimi/mempalace/rooms/Plans', label: 'Plans', types: ['md'] },
    { path: '.kimi/mempalace/rooms/Memory', label: 'Memory', types: ['md'] }
  ],
  criticalRooms: [
    'critical_decisions',
    'error_patterns',
    'infrastructure',
    'api_contracts',
    'glass_matching',
    'svv_api',
    'bovsoft'
  ],
  // Cross-lingual + semantiske ekspansjoner (Autoglass AS-spesifikke)
  semanticExpansions: {
    'glass': ['windshield', 'bilglass', 'frontrute', 'siderute', 'bakrute', 'sideglass', 'rute', 'eurocode'],
    'matching': ['ktype', 'eurocode', 'prefix4', 'regnr', 'vin', 'fitment', 'kompatibilitet', 'matching'],
    'scraping': ['scraper', 'pilkington', 'glavista', 'euroglass', 'autoglass', 'crawl', 'fetch'],
    'worker': ['cloudflare', 'worker', 'kv', 'd1', 'wrangler', 'api', 'endepunkt', 'endpoint'],
    'deploy': ['github', 'ci', 'cd', 'pipeline', 'production', 'deploy', 'produksjon', 'pages'],
    'frontend': ['html', 'css', 'js', 'i18n', 'seo', 'lighthouse', 'ui', 'page', 'frontend', 'grensesnitt'],
    'adas': ['sensor', 'calibration', 'hud', 'rain-sensor', 'camera', 'acoustic', 'heated', 'solar'],
    'svv': ['svv', 'enkeltoppslag', 'regnr', 'kjøretøy', 'vehicle', 'sivil', 'transport'],
    'bovsoft': ['bovsoft', 'ktype', 'tecdoc', 'regnum', 'vin', 'decode'],
    'kimi': ['cli', 'agent', 'mcp', 'k2.6', 'loop', 'smart'],
    'mempalace': ['memory', 'kg', 'knowledge', 'graph', 'minne', 'kunnskap'],
    'optimize': ['optimalisering', 'optimalisere', 'forbedre', 'forbedring', 'optimize', 'improve', 'enhance'],
    'fix': ['fiks', 'reparere', 'bug', 'error', 'feil', 'crash', 'broken'],
    'feature': ['funksjon', 'ny', 'implementere', 'feature', 'implement', 'add'],
  },
  // Norsk↔engelsk cross-lingual mapping (Autoglass AS)
  crossLingual: {
    'auth': 'autentisering',
    'login': 'innlogging',
    'glass': 'bilglass',
    'windshield': 'frontrute',
    'side-window': 'siderute',
    'rear-window': 'bakrute',
    'matching': 'matching',
    'scraper': 'scraper',
    'worker': 'worker',
    'deploy': 'utrulling',
    'frontend': 'grensesnitt',
    'testing': 'testing',
    'optimize': 'optimalisering',
    'improve': 'forbedre',
    'fix': 'fiks',
    'error': 'feil',
    'bug': 'feil',
    'feature': 'funksjon',
    'add': 'legge til',
    'remove': 'fjern',
    'delete': 'slett',
    'update': 'oppdater',
    'create': 'opprett',
    'search': 'søk',
    'find': 'finn',
    'get': 'hent',
    'set': 'sett',
    'config': 'konfigurasjon',
    'setting': 'innstilling',
    'user': 'bruker',
    'admin': 'admin',
    'dashboard': 'dashbord',
    'profile': 'profil',
    'session': 'sesjon',
    'vehicle': 'kjøretøy',
    'catalog': 'katalog',
    'price': 'pris',
    'supplier': 'leverandør',
    'customer': 'kunde',
    'order': 'ordre',
    'quote': 'tilbud',
    'invoice': 'faktura',
    'api': 'api',
    'key': 'nøkkel',
    'secret': 'hemmelighet',
    'password': 'passord',
    'email': 'epost',
    'notification': 'varsel',
    'alert': 'alarm',
    'log': 'logg',
    'monitor': 'overvåk',
    'health': 'helse',
    'status': 'status',
    'check': 'sjekk',
    'verify': 'verifiser',
    'validate': 'valider',
    'test': 'test',
    'run': 'kjør',
    'build': 'bygg',
    'compile': 'kompiler',
    'install': 'installer',
    'setup': 'oppsett',
    'configure': 'konfigurer',
    'enable': 'aktiver',
    'disable': 'deaktiver',
    'start': 'start',
    'stop': 'stopp',
    'restart': 'restart',
    'pause': 'pause',
    'resume': 'fortsett',
    'cancel': 'avbryt',
    'retry': 'prøv igjen',
    'rollback': 'tilbakerull',
    'backup': 'sikkerhetskopi',
    'restore': 'gjenopprett',
    'migrate': 'migrer',
    'upgrade': 'oppgrader',
    'downgrade': 'nedgrader',
    'merge': 'slå sammen',
    'split': 'del',
    'join': 'koble',
    'link': 'lenke',
    'connect': 'koble til',
    'disconnect': 'koble fra',
    'sync': 'synkroniser',
    'refresh': 'oppfrisk',
    'reload': 'last på nytt',
    'reset': 'tilbakestill',
    'clear': 'tøm',
    'clean': 'rydd',
    'purge': 'rens',
    'flush': 'flush',
    'cache': 'cache',
    'index': 'indeks',
    'query': 'spørring',
    'filter': 'filter',
    'sort': 'sorter',
    'group': 'grupper',
    'aggregate': 'aggreger',
    'sum': 'summer',
    'count': 'tell',
    'average': 'gjennomsnitt',
    'max': 'maks',
    'min': 'min',
    'total': 'total',
    'subtotal': 'delsum',
    'grandtotal': 'totalsum',
  }
};

// ─── OUTPUT TRUNCATION (v3.5.0) ───
// Respekterer KIMI CLI v1.32.0+ 100K tool-output cap.
// Truncater tekst-resultater til ~20K tegn med varsel i slutten.
function truncateOutput(text, maxChars = CONFIG.maxToolOutputChars) {
  if (!text || text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const warning = `\n\n[…truncated: ${text.length - maxChars} chars removed to stay under KIMI CLI 100K cap]`;
  return truncated + warning;
}

// ─── ROBUST FEILHÅNDTERING ───
process.on('uncaughtException', (err) => {
  log('error', 'uncaughtException: ' + err.message);
});
process.on('unhandledRejection', (reason) => {
  log('error', 'unhandledRejection: ' + reason);
});

let isShuttingDown = false;
function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log('info', `${signal} received, flushing KG + index cache...`);
  let flushed = false;
  const timeout = setTimeout(() => {
    if (!flushed) {
      log('warn', 'Shutdown timeout reached, forcing exit');
      process.exit(1);
    }
  }, 5000);
  try { saveKG(kgData); } catch { /* ignore */ }
  try { saveIndexCache(); } catch { /* ignore */ }
  flushed = true;
  clearTimeout(timeout);
  process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.stdout.on('error', () => {});
process.stdin.on('error', () => {});

// ─── LOGGING (MCP-compatible) ───
const logQueue = [];
let logClientReady = false;

function log(level, message, data) {
  const entry = { ts: new Date().toISOString(), level, message, data };
  logQueue.push(entry);
  if (level === 'error' || process.env.MEMPALACE_VERBOSE) {
    console.error(`[MemPalace ${level}] ${message}`);
  }
}

function flushLogs(sendFn) {
  logQueue.length = 0;
}

// ─── LRU CACHE ───
class LRUCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }
  get(key) {
    const val = this.cache.get(key);
    if (val !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, val);
    }
    return val;
  }
  set(key, value) {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.maxSize) {
      const first = this.cache.keys().next().value;
      this.cache.delete(first);
    }
    this.cache.set(key, value);
  }
  clear() { this.cache.clear(); }
}
const cache = new LRUCache(CONFIG.cacheSize);

// ─── IN-MEMORY INDEX (Inverted + Bigram) ───
let indexReady = false;
let indexedDocs = [];
let invertedIndex = new Map();     // token -> Set(docId)
let bigramIndex = new Map();       // "token1 token2" -> Set(docId)  NY
let docById = new Map();           // docId -> doc
let tokenDocFreq = new Map();      // token -> count of docs containing it  NY (for TF-IDF)
let fileMtimes = new Map();        // path -> mtimeMs
let kgData = {};
let watchers = [];                 // NY: fs.watch referanser

// ─── STEMMING ─── NY
const stemRules = {
  // Norsk
  'ning': 'n', 'else': '', 'et': '', 'er': '', 'te': '', 'de': '',
  'ing': '', 'ed': '', 'er': '', 'est': '', 'tion': 't', 'sion': 's',
  'het': '', 'lig': '', 'isk': '', 'ere': '', 'est': '',
  // Engelsk
  'ies': 'y', 'ied': 'y', 'ying': 'ie', 'ying': 'y',
};

function stem(token) {
  let t = token;
  for (const [suffix, replacement] of Object.entries(stemRules)) {
    if (t.length > suffix.length + 2 && t.endsWith(suffix)) {
      t = t.slice(0, -suffix.length) + replacement;
      break; // Only apply first match
    }
  }
  return t;
}

function tokenize(text) {
  const raw = String(text || '').toLowerCase()
    .replace(/[^\w\s\u00C0-\u017F]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
  // Include both raw and stemmed tokens for broader matching
  const stemmed = raw.map(t => stem(t));
  return [...new Set([...raw, ...stemmed])];
}

function getBigrams(tokens) {
  const bigrams = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return bigrams;
}

function getFiles(dir, include = [], types = []) {
  let results = [];
  try {
    const list = readdirSync(dir);
    for (const file of list) {
      const path = join(dir, file);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        results = results.concat(getFiles(path, include, types));
      } else {
        if (include.length > 0) {
          if (include.includes(file)) results.push(path);
        } else if (types.length > 0) {
          if (types.some(t => file.endsWith('.' + t))) results.push(path);
        } else if (file.endsWith('.md')) {
          results.push(path);
        }
      }
    }
  } catch (e) { /* ignore missing dirs */ }
  return results;
}

function loadKG() {
  const kgPath = resolve(root, '.kimi/mempalace/kg.json');
  if (!existsSync(kgPath)) return {};
  try { return JSON.parse(readFileSync(kgPath, 'utf8')); }
  catch { return {}; }
}

function saveKG(data) {
  const dir = resolve(root, '.kimi/mempalace');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const kgPath = resolve(dir, 'kg.json');
  const tmpPath = kgPath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  renameSync(tmpPath, kgPath);
}

function appendKGFact(subject, predicate, object, validFrom) {
  const dir = resolve(root, '.kimi/mempalace');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const appendPath = resolve(dir, 'kg-append.jsonl');
  const line = JSON.stringify({ subject, predicate, object, validFrom: validFrom || new Date().toISOString() });
  appendFileSync(appendPath, line + '\n');
}

function loadKGWithAppend() {
  const base = loadKG();
  const appendPath = resolve(root, '.kimi/mempalace/kg-append.jsonl');
  if (!existsSync(appendPath)) return base;
  try {
    const lines = readFileSync(appendPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const fact = JSON.parse(line);
        if (!base[fact.subject]) base[fact.subject] = [];
        const exists = base[fact.subject].some(f =>
          f.predicate === fact.predicate && f.object === fact.object
        );
        if (!exists) base[fact.subject].push({
          predicate: fact.predicate,
          object: fact.object,
          validFrom: fact.validFrom
        });
      } catch { /* skip bad line */ }
    }
  } catch { /* ignore */ }
  return base;
}

function compactKG() {
  const merged = loadKGWithAppend();
  const kgPath = resolve(root, '.kimi/mempalace/kg.json');
  const bakPath = kgPath + '.bak';
  try {
    if (existsSync(kgPath)) {
      writeFileSync(bakPath, readFileSync(kgPath, 'utf8'));
    }
  } catch { /* ignore */ }
  saveKG(merged);
  const appendPath = resolve(root, '.kimi/mempalace/kg-append.jsonl');
  try {
    if (existsSync(appendPath)) writeFileSync(appendPath, '');
  } catch { /* ignore */ }
  return merged;
}

function extractEntities(text) {
  const entities = { files: [], functions: [], components: [], routes: [], decisions: [], tags: [] };
  let m;
  const fileRe = /`([^`]+\.(ts|tsx|js|jsx|json|md|sql|yaml|mjs))`/g;
  while ((m = fileRe.exec(text)) !== null) entities.files.push(m[1]);
  const compRe = /<([A-Z][a-zA-Z]+)/g;
  while ((m = compRe.exec(text)) !== null) entities.components.push(m[1]);
  const routeRe = /(\/api\/[^\s]+|app\/[^\s]+)/g;
  while ((m = routeRe.exec(text)) !== null) entities.routes.push(m[1]);
  const decRe = /\b(ADR|DECISION|RFC)-\d+/gi;
  while ((m = decRe.exec(text)) !== null) entities.decisions.push(m[0]);
  const tagRe = /#([a-zA-Z_\-\/]+)/g;
  while ((m = tagRe.exec(text)) !== null) entities.tags.push(m[1]);
  return entities;
}

// ─── INDEX CACHE (Persistens) ─── NY
function saveIndexCache() {
  const cachePath = resolve(root, CONFIG.indexCachePath) + '.gz';
  const tmpPath = cachePath + '.tmp';
  const dir = dirname(cachePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const cacheData = {
    version: CONFIG.version,
    timestamp: Date.now(),
    fileMtimes: Object.fromEntries(fileMtimes),
    invertedIndex: Object.fromEntries(
      [...invertedIndex.entries()].map(([k, v]) => [k, [...v]])
    ),
    bigramIndex: Object.fromEntries(
      [...bigramIndex.entries()].map(([k, v]) => [k, [...v]])
    ),
    tokenDocFreq: Object.fromEntries(tokenDocFreq),
    docCount: indexedDocs.length,
    docs: indexedDocs.map(d => ({
      id: d.id,
      path: d.path,
      label: d.label,
      content: d.content.slice(0, 500), // Store truncated content
      raw: d.raw?.slice(0, 500),
      type: d.type,
      isRecent: d.isRecent,
      isCritical: d.isCritical,
      date: d.date,
      entities: d.entities,
      metadata: d.metadata
    }))
  };
  const json = JSON.stringify(cacheData);
  const compressed = gzipSync(json, { level: 6 });
  writeFileSync(tmpPath, compressed);
  renameSync(tmpPath, cachePath);
  log('info', `Index cache saved: ${cachePath} (${(json.length / 1024).toFixed(1)}KB → ${(compressed.length / 1024).toFixed(1)}KB gzipped)`);
}

function loadIndexCache() {
  const cachePath = resolve(root, CONFIG.indexCachePath) + '.gz';
  const legacyPath = resolve(root, CONFIG.indexCachePath);
  if (!existsSync(cachePath)) {
    // Try legacy uncompressed cache
    if (existsSync(legacyPath)) {
      try {
        const data = JSON.parse(readFileSync(legacyPath, 'utf8'));
        if (data.version === CONFIG.version) return data;
      } catch { /* ignore */ }
    }
    return null;
  }
  try {
    const compressed = readFileSync(cachePath);
    const json = gunzipSync(compressed).toString('utf8');
    const data = JSON.parse(json);
    if (data.version !== CONFIG.version) {
      log('info', `Index cache version mismatch (${data.version} != ${CONFIG.version}), rebuilding`);
      return null;
    }
    // Check which files changed — don't throw away entire cache for one changed file
    const changedFiles = [];
    for (const [relPath, mtime] of Object.entries(data.fileMtimes || {})) {
      const fullPath = resolve(root, relPath);
      if (!existsSync(fullPath)) {
        changedFiles.push(relPath);
        continue;
      }
      const currentStat = statSync(fullPath);
      if (Math.abs(currentStat.mtimeMs - mtime) > 1000) {
        changedFiles.push(relPath);
      }
    }
    if (changedFiles.length > 0) {
      log('info', `Incremental reindex needed for ${changedFiles.length} changed file(s): ${changedFiles.join(', ')}`);
      data._changedFiles = changedFiles;
    }
    return data;
  } catch {
    return null;
  }
}

function restoreIndexFromCache(data) {
  indexedDocs = data.docs || [];
  docById = new Map(indexedDocs.map(d => [d.id, d]));
  fileMtimes = new Map(Object.entries(data.fileMtimes || {}));

  invertedIndex = new Map();
  for (const [token, docIds] of Object.entries(data.invertedIndex || {})) {
    invertedIndex.set(token, new Set(docIds));
  }

  bigramIndex = new Map();
  for (const [bigram, docIds] of Object.entries(data.bigramIndex || {})) {
    bigramIndex.set(bigram, new Set(docIds));
  }

  tokenDocFreq = new Map(Object.entries(data.tokenDocFreq || {}));
  indexReady = true;
}

function addToInvertedIndex(doc) {
  const tokens = tokenize(doc.content);
  const uniqueTokens = [...new Set(tokens)];
  for (const token of uniqueTokens) {
    if (!invertedIndex.has(token)) invertedIndex.set(token, new Set());
    invertedIndex.get(token).add(doc.id);
    tokenDocFreq.set(token, (tokenDocFreq.get(token) || 0) + 1);
  }
  // Bigrams
  const bigrams = getBigrams(tokens);
  for (const bigram of [...new Set(bigrams)]) {
    if (!bigramIndex.has(bigram)) bigramIndex.set(bigram, new Set());
    bigramIndex.get(bigram).add(doc.id);
  }
  // Title/filename tokens
  const titleTokens = tokenize(basename(doc.path));
  for (const token of titleTokens) {
    if (!invertedIndex.has(token)) invertedIndex.set(token, new Set());
    invertedIndex.get(token).add(doc.id);
    tokenDocFreq.set(token, (tokenDocFreq.get(token) || 0) + 1);
  }
}

// ─── FILE WATCHER ─── NY
function setupFileWatchers() {
  if (!CONFIG.enableFileWatcher) return;
  const watchPaths = (CONFIG.fileWatcherPaths || []).map(p => resolve(root, p)).filter(p => existsSync(p));
  for (const basePath of watchPaths) {
    try {
      const w = watch(basePath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        log('info', `File ${eventType}: ${filename}, scheduling incremental reindex`);
        if (w._reindexTimer) clearTimeout(w._reindexTimer);
        w._reindexTimer = setTimeout(() => {
          incrementalReindex();
        }, CONFIG.fileWatcherDebounceMs || 2000);
      });
      w.on('error', (e) => {
        log('warn', `File watcher disabled for ${basePath}: ${e.message}`);
        try { w.close(); } catch {}
        watchers = watchers.filter(existing => existing !== w);
        if (e.code === 'EMFILE' || e.code === 'ENOSPC') {
          CONFIG.enableFileWatcher = false;
          for (const existing of watchers.splice(0)) {
            try { existing.close(); } catch {}
          }
        }
      });
      watchers.push(w);
    } catch (e) {
      log('warn', `Could not watch ${basePath}: ${e.message}`);
      if (e.code === 'EMFILE' || e.code === 'ENOSPC') {
        CONFIG.enableFileWatcher = false;
        break;
      }
    }
  }
}

function reindexSingleFile(relPath) {
  // Find which index path this file belongs to
  let target = null;
  for (const t of CONFIG.indexPaths) {
    if (relPath.startsWith(t.path)) {
      target = t;
      break;
    }
  }
  if (!target) {
    log('warn', `Cannot reindex unknown file: ${relPath}`);
    return;
  }

  const fullPath = resolve(root, relPath);
  if (!existsSync(fullPath)) {
    // File was deleted — remove from index
    const oldDoc = docById.get(relPath);
    if (oldDoc) {
      const oldTokens = tokenize(oldDoc.content);
      for (const token of oldTokens) {
        invertedIndex.get(token)?.delete(relPath);
        tokenDocFreq.set(token, (tokenDocFreq.get(token) || 1) - 1);
      }
      const oldBigrams = getBigrams(oldTokens);
      for (const bigram of oldBigrams) {
        bigramIndex.get(bigram)?.delete(relPath);
      }
      const idx = indexedDocs.findIndex(d => d.id === relPath);
      if (idx >= 0) indexedDocs.splice(idx, 1);
      docById.delete(relPath);
    }
    fileMtimes.delete(relPath);
    return;
  }

  try {
    const content = readFileSync(fullPath, 'utf8');
    const stat = statSync(fullPath);
    fileMtimes.set(relPath, stat.mtimeMs);

    // Remove old entries
    const oldDoc = docById.get(relPath);
    if (oldDoc) {
      const oldTokens = tokenize(oldDoc.content);
      for (const token of oldTokens) {
        invertedIndex.get(token)?.delete(relPath);
        tokenDocFreq.set(token, (tokenDocFreq.get(token) || 1) - 1);
      }
      const oldBigrams = getBigrams(oldTokens);
      for (const bigram of oldBigrams) {
        bigramIndex.get(bigram)?.delete(relPath);
      }
      const idx = indexedDocs.findIndex(d => d.id === relPath);
      if (idx >= 0) indexedDocs.splice(idx, 1);
      docById.delete(relPath);
    }

    // Also remove any diary sub-docs from this file
    const diaryDocs = indexedDocs.filter(d => d.path === relPath);
    for (const d of diaryDocs) {
      const oldTokens = tokenize(d.content);
      for (const token of oldTokens) {
        invertedIndex.get(token)?.delete(d.id);
        tokenDocFreq.set(token, (tokenDocFreq.get(token) || 1) - 1);
      }
      const oldBigrams = getBigrams(oldTokens);
      for (const bigram of oldBigrams) {
        bigramIndex.get(bigram)?.delete(d.id);
      }
      const idx = indexedDocs.findIndex(doc => doc.id === d.id);
      if (idx >= 0) indexedDocs.splice(idx, 1);
      docById.delete(d.id);
    }

    const isRecent = (Date.now() - stat.mtimeMs) < 7 * 24 * 60 * 60 * 1000;
    const isCritical = CONFIG.criticalRooms.some(r => relPath.includes(r));

    if (relPath.endsWith('.jsonl')) {
      const lines = content.split('\n').filter(l => l.trim());
      lines.forEach((line, idx) => {
        try {
          const entry = JSON.parse(line);
          const doc = {
            id: `${relPath}#${idx}`,
            path: relPath,
            label: target.label,
            content: `${entry.type || ''} ${entry.task || ''} ${entry.agent || ''}`,
            raw: line,
            type: 'diary',
            isRecent,
            isCritical: false,
            date: entry.ts || new Date(stat.mtime).toISOString(),
            metadata: entry
          };
          indexedDocs.push(doc);
          docById.set(doc.id, doc);
          addToInvertedIndex(doc);
        } catch { /* skip */ }
      });
    } else {
      const doc = {
        id: relPath,
        path: relPath,
        label: target.label,
        content: content,
        raw: content.slice(0, 2000),
        type: 'document',
        isRecent,
        isCritical,
        date: new Date(stat.mtime).toISOString(),
        entities: extractEntities(content)
      };
      indexedDocs.push(doc);
      docById.set(doc.id, doc);
      addToInvertedIndex(doc);
    }
  } catch (e) {
    log('warn', `Failed to reindex ${relPath}: ${e.message}`);
  }
}

function incrementalReindex() {
  log('info', 'Running incremental reindex...');
  for (const target of CONFIG.indexPaths) {
    const basePath = resolve(root, target.path);
    if (!existsSync(basePath)) continue;
    const files = getFiles(basePath, target.include, target.types);
    for (const file of files) {
      try {
        const stat = statSync(file);
        const relPath = relative(root, file);
        const prevMtime = fileMtimes.get(relPath);
        if (!prevMtime || stat.mtimeMs > prevMtime) {
          // Remove old entries for this doc
          const oldDoc = docById.get(relPath);
          if (oldDoc) {
            const oldTokens = tokenize(oldDoc.content);
            for (const token of oldTokens) {
              invertedIndex.get(token)?.delete(relPath);
              tokenDocFreq.set(token, (tokenDocFreq.get(token) || 1) - 1);
            }
            const idx = indexedDocs.findIndex(d => d.id === relPath);
            if (idx >= 0) indexedDocs.splice(idx, 1);
            docById.delete(relPath);
          }
          // Re-add
          const content = readFileSync(file, 'utf8');
          fileMtimes.set(relPath, stat.mtimeMs);
          const isRecent = (Date.now() - stat.mtimeMs) < 7 * 24 * 60 * 60 * 1000;
          const isCritical = CONFIG.criticalRooms.some(r => relPath.includes(r));

          if (file.endsWith('.jsonl')) {
            const lines = content.split('\n').filter(l => l.trim());
            lines.forEach((line, idx) => {
              try {
                const entry = JSON.parse(line);
                const doc = {
                  id: `${relPath}#${idx}`,
                  path: relPath,
                  label: target.label,
                  content: `${entry.type || ''} ${entry.task || ''} ${entry.agent || ''}`,
                  raw: line,
                  type: 'diary',
                  isRecent,
                  isCritical: false,
                  date: entry.ts || new Date(stat.mtime).toISOString(),
                  metadata: entry
                };
                indexedDocs.push(doc);
                docById.set(doc.id, doc);
                addToInvertedIndex(doc);
              } catch { /* skip */ }
            });
          } else {
            const doc = {
              id: relPath,
              path: relPath,
              label: target.label,
              content: content,
              raw: content.slice(0, 2000),
              type: 'document',
              isRecent,
              isCritical,
              date: new Date(stat.mtime).toISOString(),
              entities: extractEntities(content)
            };
            indexedDocs.push(doc);
            docById.set(doc.id, doc);
            addToInvertedIndex(doc);
          }
        }
      } catch (e) { /* skip unreadable */ }
    }
  }
  cache.clear();
  log('info', `Incremental reindex complete: ${indexedDocs.length} docs, ${invertedIndex.size} tokens, ${bigramIndex.size} bigrams`);
}

function buildIndex(force = false) {
  const startTime = Date.now();

  // Try loading from cache first
  if (!force) {
    const cached = loadIndexCache();
    if (cached) {
      restoreIndexFromCache(cached);
      const duration = Date.now() - startTime;
      log('info', `Index restored from cache: ${indexedDocs.length} docs, ${invertedIndex.size} tokens, ${bigramIndex.size} bigrams (${duration}ms)`);

      // Incremental reindex for changed files only
      if (cached._changedFiles && cached._changedFiles.length > 0) {
        const incStart = Date.now();
        for (const relPath of cached._changedFiles) {
          reindexSingleFile(relPath);
        }
        cache.clear();
        log('info', `Incremental reindex complete for ${cached._changedFiles.length} file(s) (+${Date.now() - incStart}ms)`);
      }

      kgData = loadKGWithAppend();
      setupFileWatchers();
      return;
    }
  }

  log('info', 'Building inverted + bigram index from scratch...');

  indexedDocs = [];
  invertedIndex = new Map();
  bigramIndex = new Map();
  docById = new Map();
  tokenDocFreq = new Map();
  fileMtimes = new Map();

  for (const target of CONFIG.indexPaths) {
    const basePath = resolve(root, target.path);
    if (!existsSync(basePath)) continue;
    const files = getFiles(basePath, target.include, target.types);
    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf8');
        const relPath = relative(root, file);
        const stat = statSync(file);
        fileMtimes.set(relPath, stat.mtimeMs);
        const isRecent = (Date.now() - stat.mtimeMs) < 7 * 24 * 60 * 60 * 1000;
        const isCritical = CONFIG.criticalRooms.some(r => relPath.includes(r));

        if (file.endsWith('.jsonl')) {
          const lines = content.split('\n').filter(l => l.trim());
          lines.forEach((line, idx) => {
            try {
              const entry = JSON.parse(line);
              const doc = {
                id: `${relPath}#${idx}`,
                path: relPath,
                label: target.label,
                content: `${entry.type || ''} ${entry.task || ''} ${entry.agent || ''}`,
                raw: line,
                type: 'diary',
                isRecent,
                isCritical: false,
                date: entry.ts || new Date(stat.mtime).toISOString(),
                metadata: entry
              };
              indexedDocs.push(doc);
              docById.set(doc.id, doc);
              addToInvertedIndex(doc);
            } catch { /* skip */ }
          });
        } else {
          const doc = {
            id: relPath,
            path: relPath,
            label: target.label,
            content: content,
            raw: content.slice(0, 2000),
            type: 'document',
            isRecent,
            isCritical,
            date: new Date(stat.mtime).toISOString(),
            entities: extractEntities(content)
          };
          indexedDocs.push(doc);
          docById.set(doc.id, doc);
          addToInvertedIndex(doc);
        }
      } catch (e) { /* skip unreadable */ }
    }
  }

  indexReady = true;
  kgData = loadKGWithAppend();
  const duration = Date.now() - startTime;
  log('info', `Index built: ${indexedDocs.length} docs, ${invertedIndex.size} tokens, ${bigramIndex.size} bigrams, ${Object.keys(kgData).length} KG entities (${duration}ms)`);

  // Save cache for next startup
  try { saveIndexCache(); } catch { /* ignore */ }
  setupFileWatchers();
}

// Non-blocking index build
buildIndex();

// ─── SØKE-FUNKSJONER (TF-IDF + Bigram) ───
function idf(token) {
  const docFreq = tokenDocFreq.get(token) || 1;
  return Math.log((indexedDocs.length || 1) / docFreq) + 1;
}

function getContextSnippet(doc, tokens, windowSize = 80) {
  // Find the best matching position and extract context around it
  const content = doc.content;
  const lowerContent = content.toLowerCase();
  let bestPos = -1;
  let bestScore = 0;

  for (const token of tokens) {
    let pos = lowerContent.indexOf(token);
    while (pos !== -1) {
      // Score based on position (earlier = slightly better) + density
      const surrounding = lowerContent.slice(Math.max(0, pos - 50), pos + 50);
      const matches = tokens.filter(t => surrounding.includes(t)).length;
      const score = matches * 10 - pos * 0.001;
      if (score > bestScore) {
        bestScore = score;
        bestPos = pos;
      }
      pos = lowerContent.indexOf(token, pos + 1);
    }
  }

  if (bestPos === -1) {
    return content.split('\n').find(l => l.trim()) || content.slice(0, 200);
  }

  const start = Math.max(0, bestPos - windowSize);
  const end = Math.min(content.length, bestPos + windowSize);
  let snippet = content.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';
  return snippet.replace(/\s+/g, ' ').trim();
}

function searchDocs(query, opts = {}) {
  const cacheKey = `search:${query}:${opts.room || 'all'}:${opts.limit || 5}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const limit = opts.limit || 5;
  const roomFilter = opts.room;
  const since = opts.since ? new Date(opts.since) : null;

  // Get query bigrams
  const queryBigrams = getBigrams(tokens);

  // Inverted index lookup with TF-IDF scoring
  const candidateScores = new Map();
  for (const token of tokens) {
    const docSet = invertedIndex.get(token);
    if (!docSet) continue;
    const tokenIdf = idf(token);
    for (const docId of docSet) {
      const doc = docById.get(docId);
      if (!doc) continue;
      if (roomFilter && !doc.label.toLowerCase().includes(roomFilter.toLowerCase())) continue;
      if (since && doc.date && new Date(doc.date) < since) continue;

      const docTokens = tokenize(doc.content);
      const tf = docTokens.filter(t => t === token || stem(t) === stem(token)).length;
      const score = tf * tokenIdf;

      candidateScores.set(docId, (candidateScores.get(docId) || 0) + score);
    }
  }

  // Bigram boost
  for (const bigram of queryBigrams) {
    const docSet = bigramIndex.get(bigram);
    if (!docSet) continue;
    for (const docId of docSet) {
      if (!candidateScores.has(docId)) continue;
      candidateScores.set(docId, candidateScores.get(docId) * 1.5); // 50% boost for bigram match
    }
  }

  // Apply boosters and build results
  const hits = [];
  for (const [docId, baseScore] of candidateScores) {
    const doc = docById.get(docId);
    let score = baseScore;
    if (doc.isRecent) score *= 1.4;
    if (doc.isCritical) score *= 1.6;
    if (doc.type === 'diary' && doc.metadata?.type === 'FIX') score *= 1.3;

    const snippet = getContextSnippet(doc, tokens, 100);

    hits.push({
      score,
      id: doc.id,
      path: doc.path,
      label: doc.label,
      snippet: snippet.trim(),
      type: doc.type,
      date: doc.date,
      entities: doc.entities || {}
    });
  }

  const result = hits.sort((a, b) => b.score - a.score).slice(0, limit);
  cache.set(cacheKey, result);
  return result;
}

function semanticSearch(concept, opts = {}) {
  // Expand concept with synonyms from config, KG, and cross-lingual
  const expansions = [concept];
  const conceptLower = concept.toLowerCase();

  // Semantic expansions
  for (const [key, synonyms] of Object.entries(CONFIG.semanticExpansions)) {
    if (conceptLower.includes(key) || key.includes(conceptLower)) {
      expansions.push(...synonyms);
    }
  }

  // Cross-lingual
  if (CONFIG.crossLingual[conceptLower]) {
    expansions.push(CONFIG.crossLingual[conceptLower]);
  }
  for (const [en, no] of Object.entries(CONFIG.crossLingual)) {
    if (no === conceptLower) expansions.push(en);
  }

  // KG-based expansion
  const kgFacts = kgData[conceptLower] || [];
  for (const fact of kgFacts) {
    if (['uses', 'related-to', 'synonym', 'implements', 'depends-on'].includes(fact.predicate)) {
      expansions.push(fact.object);
    }
  }

  const uniqueExpansions = [...new Set(expansions)];
  const allResults = [];
  const seenIds = new Set();

  for (const term of uniqueExpansions.slice(0, 8)) { // økt fra 6 til 8
    const results = searchDocs(term, { room: opts.room, limit: opts.limit || 5 });
    for (const r of results) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id);
        allResults.push({ ...r, matchedTerm: term, semanticScore: r.score * 0.8 });
      }
    }
  }

  // Re-sort by semantic score
  return allResults.sort((a, b) => b.semanticScore - a.semanticScore).slice(0, opts.limit || 5);
}

function recentContext(hours = 24, room) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const docs = indexedDocs.filter(d => {
    if (!d.date) return false;
    const dDate = new Date(d.date);
    return dDate >= since && (!room || d.label.toLowerCase().includes(room.toLowerCase()));
  });
  return docs.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
}

// ─── KNOWLEDGE GRAPH ───
function kgQuery(entity, depth = 1) {
  const direct = kgData[entity] || [];
  const related = {};
  if (depth > 1) {
    direct.forEach(fact => {
      if (kgData[fact.object]) related[fact.object] = kgData[fact.object];
      for (const [otherEntity, facts] of Object.entries(kgData)) {
        if (facts.some(f => f.object === entity)) {
          if (!related[otherEntity]) related[otherEntity] = facts.filter(f => f.object === entity);
        }
      }
    });
  }
  return { entity, facts: direct, related, depth };
}

function kgAdd(subject, predicate, object, validFrom) {
  if (!kgData[subject]) kgData[subject] = [];
  const exists = kgData[subject].some(f =>
    f.predicate === predicate && f.object === object
  );
  if (exists) {
    return { success: true, duplicate: true, fact: { subject, predicate, object } };
  }
  const fact = {
    predicate,
    object,
    validFrom: validFrom || new Date().toISOString()
  };
  kgData[subject].push(fact);
  appendKGFact(subject, predicate, object, fact.validFrom);

  const appendPath = resolve(root, '.kimi/mempalace/kg-append.jsonl');
  try {
    if (existsSync(appendPath)) {
      const stats = statSync(appendPath);
      if (stats.size > 50 * 1024) {
        kgData = compactKG();
        log('info', 'KG compacted after append threshold reached');
      }
    }
  } catch { /* ignore */ }

  return { success: true, duplicate: false, fact: { subject, predicate, object } };
}

function kgBatch(facts) {
  const results = [];
  let added = 0;
  let duplicates = 0;
  for (const f of facts.slice(0, CONFIG.batchSize)) {
    if (!kgData[f.subject]) kgData[f.subject] = [];
    const exists = kgData[f.subject].some(existing =>
      existing.predicate === f.predicate && existing.object === f.object
    );
    if (exists) {
      duplicates++;
      results.push({ success: true, duplicate: true, fact: f });
      continue;
    }
    kgData[f.subject].push({
      predicate: f.predicate,
      object: f.object,
      validFrom: f.validFrom || new Date().toISOString()
    });
    appendKGFact(f.subject, f.predicate, f.object, f.validFrom);
    added++;
    results.push({ success: true, duplicate: false, fact: f });
  }

  const appendPath = resolve(root, '.kimi/mempalace/kg-append.jsonl');
  try {
    if (existsSync(appendPath)) {
      const stats = statSync(appendPath);
      if (stats.size > 50 * 1024) {
        kgData = compactKG();
        log('info', 'KG compacted after batch append threshold reached');
      }
    }
  } catch { /* ignore */ }

  return { success: true, added, duplicates, total: facts.length, results };
}

function kgFindPath(from, to, maxDepth = 3) {
  const visited = new Set();
  const queue = [[{ entity: from, predicate: 'start', object: from }]];

  while (queue.length > 0) {
    const path = queue.shift();
    const last = path[path.length - 1];
    if (last.object === to || last.entity === to) return path;
    if (path.length >= maxDepth) continue;

    const facts = kgData[last.object] || kgData[last.entity] || [];
    for (const fact of facts) {
      const key = `${last.object}:${fact.object}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push([...path, fact]);
      }
    }
  }
  return null;
}

// ─── DIARY ───
function readDiary(agent, lastN = 10) {
  const diaryPath = resolve(root, '.kimi/diary.jsonl');
  if (!existsSync(diaryPath)) return [];
  try {
    const lines = readFileSync(diaryPath, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-lastN).map(line => JSON.parse(line)).filter(e => !agent || e.agent === agent);
  } catch { return []; }
}

function chunkDiaryLine(line, baseId, maxLen = 800) {
  // Split long diary lines into multiple sub-docs for better snippet precision
  if (line.length <= maxLen) return [line];
  const chunks = [];
  for (let i = 0; i < line.length; i += maxLen) {
    chunks.push(line.slice(i, i + maxLen));
  }
  return chunks;
}

function writeDiary(agent, entry) {
  const diaryPath = resolve(root, '.kimi/diary.jsonl');
  const dir = dirname(diaryPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const record = JSON.stringify({
    ts: new Date().toISOString(),
    type: entry.type || 'AUTO',
    task: entry.task || entry,
    agent: agent || 'kimi',
    status: entry.status || 'GO',
    rating: entry.rating || 3,
    files: entry.files || 0,
    tags: entry.tags || []
  });

  try {
    const existing = existsSync(diaryPath) ? readFileSync(diaryPath, 'utf8') : '';
    const needsNewline = existing.length > 0 && !existing.endsWith('\n');
    const separator = needsNewline ? '\n' : '';
    writeFileSync(diaryPath, existing + separator + record + '\n', 'utf8');
  } catch {
    writeFileSync(diaryPath, record + '\n', 'utf8');
  }

  cache.clear();
  const baseId = Date.now();
  const content = entry.task || '';
  const chunks = chunkDiaryLine(content, baseId, 800);
  chunks.forEach((chunk, idx) => {
    const diaryDoc = {
      id: `.kimi/diary.jsonl#${baseId}-${idx}`,
      path: '.kimi/diary.jsonl',
      label: 'Diary',
      content: chunk,
      raw: record,
      type: 'diary',
      isRecent: true,
      isCritical: false,
      date: new Date().toISOString(),
      metadata: { type: entry.type, task: entry.task, agent, status: entry.status }
    };
    indexedDocs.push(diaryDoc);
    docById.set(diaryDoc.id, diaryDoc);
    addToInvertedIndex(diaryDoc);
  });

  return { success: true };
}

// ─── MCP SERVER ───
class MempalaceMCP {
  constructor() {
    this.serverInfo = {
      name: 'mempalace-mcp',
      version: CONFIG.version,
      features: ['search', 'semantic_search', 'recent_context', 'kg_query', 'kg_add', 'kg_batch', 'kg_find_path', 'read_diary', 'write_diary', 'get_status', 'get_room_info', 'auto_tag']
    };
  }

  handleRequest(req) {
    const { method, params } = req;

    switch (method) {
      case 'notifications/initialized':
        logClientReady = true;
        return undefined;

      case 'initialize': {
        this.clientInfo = params?.clientInfo || null;
        return {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
            prompts: { listChanged: false },
            logging: {}
          },
          serverInfo: this.serverInfo,
          instructions: `MemPalace v${CONFIG.version} — prosjektkunnskap for Autoglass AS B2B bilglass-grossist.\n\nKapabiliteter:\n- TF-IDF + Bigram scoring for presisere søk\n- Index persistens (<100ms oppstart)\n- Cross-lingual norsk↔engelsk\n- File watcher for inkrementell reindex\n- Stemming (norsk + engelsk)\n\nBruk search først for å finne eksisterende kontekst. Bruk semantic_search for konsept-søk. Bruk kg_query for å utforske relasjoner. Resources: mempalace://document/{path}, mempalace://kg/{entity}.`
        };
      }

      case 'tools/list':
        return { tools: this.getTools() };

      case 'resources/list': {
        const resources = indexedDocs.slice(0, 50).map(d => ({
          uri: `mempalace://document/${d.path}`,
          name: basename(d.path),
          description: `${d.label} — ${d.content.slice(0, 80)}...`,
          mimeType: d.path.endsWith('.jsonl') ? 'application/x-ndjson' : 'text/markdown'
        }));
        for (const entity of Object.keys(kgData).slice(0, 20)) {
          resources.push({
            uri: `mempalace://kg/${entity}`,
            name: `KG: ${entity}`,
            description: `${kgData[entity].length} facts about ${entity}`,
            mimeType: 'application/json'
          });
        }
        return { resources };
      }

      case 'resources/read': {
        const uri = params?.uri || '';
        if (uri.startsWith('mempalace://document/')) {
          const path = uri.replace('mempalace://document/', '');
          const doc = docById.get(path);
          if (doc) {
            return {
              contents: [{
                uri,
                mimeType: doc.path.endsWith('.jsonl') ? 'application/x-ndjson' : 'text/markdown',
                text: doc.content
              }]
            };
          }
          const diskPath = resolve(root, path);
          if (existsSync(diskPath)) {
            const text = readFileSync(diskPath, 'utf8');
            return {
              contents: [{
                uri,
                mimeType: path.endsWith('.jsonl') ? 'application/x-ndjson' : 'text/markdown',
                text
              }]
            };
          }
          throw new Error(`Document not found: ${path}`);
        }
        if (uri.startsWith('mempalace://kg/')) {
          const entity = uri.replace('mempalace://kg/', '');
          const data = kgQuery(entity, 1);
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(data, null, 2)
            }]
          };
        }
        throw new Error(`Unknown resource URI scheme: ${uri}`);
      }

      case 'resources/templates/list': {
        return {
          resourceTemplates: [
            {
              uriTemplate: 'mempalace://document/{path}',
              name: 'MemPalace Document',
              description: 'Read any indexed document by path',
              mimeType: 'text/markdown'
            },
            {
              uriTemplate: 'mempalace://kg/{entity}',
              name: 'MemPalace KG Entity',
              description: 'Read knowledge graph facts for an entity',
              mimeType: 'application/json'
            }
          ]
        };
      }

      case 'prompts/list':
        return { prompts: this.getPrompts() };

      case 'prompts/get': {
        const prompt = this.getPrompts().find(p => p.name === params?.name);
        if (!prompt) throw new Error(`Prompt not found: ${params?.name}`);
        const messages = this.buildPromptMessages(params?.name, params?.arguments || {});
        return { description: prompt.description, messages };
      }

      case 'tools/call': {
        const { name, arguments: args } = params;
        const result = this.callTool(name, args);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      }

      case 'ping':
        return {};

      default:
        throw new Error(`Ukjent method: ${method}`);
    }
  }

  getPrompts() {
    return [
      {
        name: 'pre_task',
        description: 'Kjør FØR enhver signifikant oppgave. Søker i minne, KG og recent context.',
        arguments: [
          { name: 'task', description: 'Beskrivelse av oppgaven', required: true },
          { name: 'domain', description: 'Domene (auth, trading, deploy, etc.)', required: false }
        ]
      },
      {
        name: 'post_task',
        description: 'Kjør ETTER enhver signifikant oppgave. Lagrer fakta og diary entry.',
        arguments: [
          { name: 'task', description: 'Hva som ble gjort', required: true },
          { name: 'files', description: 'Antall filer endret', required: false },
          { name: 'status', description: 'GO, NO-GO, eller WIP', required: false }
        ]
      },
      {
        name: 'agent_auth',
        description: 'System prompt for auth-agent. Inkluderer auth-spesifikk kontekst.',
        arguments: []
      },
      {
        name: 'agent_architect',
        description: 'System prompt for architect-agent. Inkluderer arkitektur-kontekst.',
        arguments: []
      },
      {
        name: 'superkimi_boost',
        description: 'Aktiverer SUPERKIMI-modus: maksimal kontekst, tenke-disiplin, verify-loop.',
        arguments: []
      }
    ];
  }

  buildPromptMessages(name, args) {
    switch (name) {
      case 'pre_task': {
        const domain = args.domain || '';
        const searchResults = searchDocs(args.task, { limit: 5 });
        const recent = recentContext(48);
        const kgEntity = domain ? kgQuery(domain, 1) : null;
        return [{
          role: 'user',
          content: {
            type: 'text',
            text: `## Pre-Task Context for: ${args.task}\n\n### Relevant Knowledge (${searchResults.length} hits)\n${searchResults.map(r => `- ${r.path} (${r.label}): ${r.snippet.slice(0, 120)}`).join('\n') || 'None'}\n\n### Recent Activity (${recent.length} entries)\n${recent.slice(0, 5).map(r => `- ${r.path} (${r.date}): ${r.content.slice(0, 80)}`).join('\n') || 'None'}\n\n${kgEntity ? `### KG: ${kgEntity.entity}\n${kgEntity.facts.map(f => `- ${f.predicate} → ${f.object}`).join('\n')}` : ''}\n\nProceed with the task using this context. Always verify claims before making changes.`
          }
        }];
      }
      case 'post_task': {
        return [{
          role: 'user',
          content: {
            type: 'text',
            text: `## Post-Task Summary\nTask: ${args.task}\nStatus: ${args.status || 'GO'}\nFiles: ${args.files || 0}\n\nRemember to:\n1. Save key facts to KG with kg_add or kg_batch\n2. Write diary entry with write_diary\n3. Run verify if >3 files changed: node scripts/smoke-test.mjs`
          }
        }];
      }
      case 'agent_auth': {
        return [{
          role: 'user',
          content: {
            type: 'text',
            text: `You are the Auth Agent for Autoglass AS.\n\nRules:\n- NEVER hardcode API keys — use wrangler secrets or GitHub secrets\n- ALWAYS verify CORS headers in Worker match auto-glass.no domains\n- ALWAYS run smoke-test after auth-related changes\n- Ingen auth-endepunkter skal logge secrets eller API-nøkler`
          }
        }];
      }
      case 'agent_architect': {
        return [{
          role: 'user',
          content: {
            type: 'text',
            text: `You are the Lead Architect for Autoglass AS.\n\nStack: Vanilla JS, Cloudflare Worker + KV + D1 + Pages, TypeScript, HTML/CSS\nPrinciples: Minimal change, verify first, GO/NO-GO, dokumenter alt\n\nBefore decisions:\n1. Search MemPalace for existing patterns\n2. Check KG for related entities\n3. Review recent context\n\nAfter decisions:\n1. Document in KG with kg_add\n2. Write diary entry with write_diary\n3. Update ADR in docs/adr/ if architectural`
          }
        }];
      }
      case 'superkimi_boost': {
        return [{
          role: 'user',
          content: {
            type: 'text',
            text: `🧠 SUPERKIMI MODUS AKTIVERT\n\nDu kjører med:\n- 262k kontekst (k2.6)\n- 750 steps per turn\n- Ralph Loop (self-improvement, max 3 iterasjoner)
- MemPalace v3.4.0 (TF-IDF + Bigram + Cross-lingual + Atomic writes)
- ${Object.keys(kgData).length} KG entities, ${indexedDocs.length} docs\n\nTenke-disiplin:\n1. Les før du skriver — Grep > ReadFile\n2. Tenk steg-for-steg — forklar plan før handling\n3. Selv-verifiser — "Bryter dette regler?"\n4. Post-change verify — kjør smoke-test ved >3 filer\n5. Kontekst-bevissthet — 262k tokens, vær selektiv\n\nAutomatiser alt som kan automatiseres.`
          }
        }];
      }
      default:
        return [];
    }
  }

  getTools() {
    return [
      {
        name: 'search',
        description: 'Søk i MemPalace kunnskap med TF-IDF + Bigram rangering. Bruk dette FØRST. Output truncates ved ~20K tegn.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Søkestreng — vær spesifikk' },
            room: { type: 'string', description: 'Rom-filter: Knowledge, Diary, Handoffs, Plans, Docs, Memory' },
            limit: { type: 'number', description: 'Maks resultater (default: 5)', default: 5 },
            since: { type: 'string', description: 'ISO dato — kun treff etter denne datoen' }
          },
          required: ['query']
        }
      },
      {
        name: 'semantic_search',
        description: 'Semantisk søk med KG + Cross-lingual synonym-ekspansjon. Bruk når søkeord kan variere. Output truncates ved ~20K tegn.',
        inputSchema: {
          type: 'object',
          properties: {
            concept: { type: 'string', description: 'Konsept/ide å søke etter' },
            room: { type: 'string' },
            limit: { type: 'number', default: 5 }
          },
          required: ['concept']
        }
      },
      {
        name: 'recent_context',
        description: 'Hent nylig lagt til innhold (siste N timer). Bruk for å finne det som skjedde i forrige sesjon. Output truncates ved ~20K tegn.',
        inputSchema: {
          type: 'object',
          properties: {
            hours: { type: 'number', description: 'Timer tilbake (default: 24)', default: 24 },
            room: { type: 'string', description: 'Rom-filter' }
          }
        }
      },
      {
        name: 'kg_query',
        description: 'Query knowledge graph for entity. F.eks. kg_query(entity="auth-system") finner alt vi vet om auth.',
        inputSchema: {
          type: 'object',
          properties: {
            entity: { type: 'string', description: 'Entity name' },
            depth: { type: 'number', description: 'Relasjons-dybde (1=direkte, 2=relaterte)', default: 1 }
          },
          required: ['entity']
        }
      },
      {
        name: 'kg_add',
        description: 'Legg til faktum i knowledge graph. F.eks. kg_add(subject="auth", predicate="uses", object="refresh-token-guard")',
        inputSchema: {
          type: 'object',
          properties: {
            subject: { type: 'string' },
            predicate: { type: 'string' },
            object: { type: 'string' },
            validFrom: { type: 'string', description: 'ISO dato' }
          },
          required: ['subject', 'predicate', 'object']
        }
      },
      {
        name: 'kg_batch',
        description: 'Batch-insert flere KG-fakta på en gang. Effektivt for k2.6 sin store kontekst.',
        inputSchema: {
          type: 'object',
          properties: {
            facts: {
              type: 'array',
              description: 'Array av {subject, predicate, object, validFrom?}',
              items: { type: 'object' }
            }
          },
          required: ['facts']
        }
      },
      {
        name: 'kg_find_path',
        description: 'Finn sti mellom to entiteter i knowledge graph. F.eks. auth -> trading.',
        inputSchema: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            maxDepth: { type: 'number', default: 3 }
          },
          required: ['from', 'to']
        }
      },
      {
        name: 'read_diary',
        description: 'Les dagbok for agent. Standard: siste 10 entries.',
        inputSchema: {
          type: 'object',
          properties: {
            agent: { type: 'string', description: 'Agent name (default: kimi)' },
            lastN: { type: 'number', description: 'Antall entries', default: 10 }
          }
        }
      },
      {
        name: 'write_diary',
        description: 'Skriv til dagbok. Bruk etter hver signifikant oppgave.',
        inputSchema: {
          type: 'object',
          properties: {
            agent: { type: 'string', default: 'kimi' },
            entry: {
              type: 'object',
              description: '{type, task, status, rating, files, tags}',
              properties: {
                type: { type: 'string', enum: ['FEAT', 'FIX', 'REF', 'DOC', 'OPT', 'SEC', 'ANALYSIS', 'AUTO'] },
                task: { type: 'string' },
                status: { type: 'string', enum: ['GO', 'NO-GO', 'WIP'] },
                rating: { type: 'number', minimum: 1, maximum: 5 },
                files: { type: 'number' },
                tags: { type: 'array', items: { type: 'string' } }
              }
            }
          },
          required: ['entry']
        }
      },
      {
        name: 'get_status',
        description: 'MemPalace systemstatus — indexeringsstatus, antall dokumenter, cache-størrelse.',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'get_room_info',
        description: 'Informasjon om et rom eller list alle rom.',
        inputSchema: {
          type: 'object',
          properties: {
            roomName: { type: 'string', description: 'Rom-navn (valgfri)' }
          }
        }
      },
      {
        name: 'auto_tag',
        description: 'Auto-generer semantiske tags for en tekst basert på KG + expansions + cross-lingual.',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Tekst å analysere' },
            maxTags: { type: 'number', default: 5 }
          },
          required: ['text']
        }
      }
    ];
  }

  callTool(name, args) {
    switch (name) {
      case 'search': {
        // Check query cache first
        const cacheKey = queryCache.makeKey('search', args);
        const cached = queryCache.get(cacheKey);
        if (cached) {
          log('info', `Query cache hit for: ${args.query}`);
          return cached;
        }

        const results = searchDocs(args.query, { room: args.room, limit: args.limit, since: args.since });
        const payload = {
          query: args.query,
          hits: results.length,
          cached: false,
          results: results.map(r => ({
            ...r,
            snippet: r.snippet.slice(0, CONFIG.maxResultChars)
          }))
        };
        const result = JSON.parse(truncateOutput(JSON.stringify(payload), CONFIG.maxToolOutputChars));
        
        // Cache successful search results
        if (result && result.hits !== undefined) {
          queryCache.set(cacheKey, result);
        }
        
        return result;
      }

      case 'semantic_search': {
        // Check query cache first
        const cacheKey = queryCache.makeKey('semantic_search', args);
        const cached = queryCache.get(cacheKey);
        if (cached) {
          log('info', `Query cache hit for semantic_search: ${args.concept}`);
          return cached;
        }

        const results = semanticSearch(args.concept, { room: args.room, limit: args.limit || 5 });
        const payload = { concept: args.concept, hits: results.length, cached: false, results };
        const result = JSON.parse(truncateOutput(JSON.stringify(payload), CONFIG.maxToolOutputChars));
        
        // Cache successful results
        if (result && result.hits !== undefined) {
          queryCache.set(cacheKey, result);
        }
        
        return result;
      }

      case 'recent_context': {
        // Check query cache first
        const cacheKey = queryCache.makeKey('recent_context', args);
        const cached = queryCache.get(cacheKey);
        if (cached) {
          log('info', `Query cache hit for recent_context: ${args.hours || 24}h`);
          return cached;
        }

        const docs = recentContext(args.hours || 24, args.room);
        const payload = {
          hours: args.hours || 24,
          hits: docs.length,
          cached: false,
          results: docs.map(d => ({
            id: d.id,
            path: d.path,
            label: d.label,
            date: d.date,
            preview: d.content.slice(0, 300)
          }))
        };
        const result = JSON.parse(truncateOutput(JSON.stringify(payload), CONFIG.maxToolOutputChars));
        
        // Cache successful results
        if (result && result.hits !== undefined) {
          queryCache.set(cacheKey, result);
        }
        
        return result;
      }

      case 'kg_query': {
        const payload = kgQuery(args.entity, args.depth || 1);
        return JSON.parse(truncateOutput(JSON.stringify(payload), CONFIG.maxToolOutputChars));
      }

      case 'kg_add':
        return kgAdd(args.subject, args.predicate, args.object, args.validFrom);

      case 'kg_batch': {
        const payload = kgBatch(args.facts || []);
        return JSON.parse(truncateOutput(JSON.stringify(payload), CONFIG.maxToolOutputChars));
      }

      case 'kg_find_path': {
        const payload = {
          from: args.from,
          to: args.to,
          path: kgFindPath(args.from, args.to, args.maxDepth || 3)
        };
        return JSON.parse(truncateOutput(JSON.stringify(payload), CONFIG.maxToolOutputChars));
      }

      case 'read_diary': {
        const payload = { agent: args.agent || 'kimi', entries: readDiary(args.agent, args.lastN || 10) };
        return JSON.parse(truncateOutput(JSON.stringify(payload), CONFIG.maxToolOutputChars));
      }

      case 'write_diary': {
        const entry = typeof args.entry === 'string' ? { task: args.entry } : args.entry;
        return writeDiary(args.agent || 'kimi', entry);
      }

      case 'get_status':
        return {
          version: CONFIG.version,
          wing: CONFIG.wing,
          indexReady,
          documents: indexedDocs.length,
          tokens: invertedIndex.size,
          bigrams: bigramIndex.size,
          cacheSize: cache.cache.size,
          kgEntities: Object.keys(kgData).length,
          rooms: CONFIG.indexPaths.map(p => p.label),
          criticalRooms: CONFIG.criticalRooms,
          maxToolOutputChars: CONFIG.maxToolOutputChars,
          kimiCliCompatibility: '0.11.0',
          queryCache: queryCache.getStats()
        };

      case 'get_room_info': {
        if (args.roomName) {
          const target = CONFIG.indexPaths.find(p => p.label.toLowerCase() === args.roomName.toLowerCase());
          if (!target) return { error: `Rom '${args.roomName}' ikke funnet`, available: CONFIG.indexPaths.map(p => p.label) };
          const files = getFiles(resolve(root, target.path), target.include, target.types);
          const filesWithMeta = files.map(f => {
            const stat = statSync(f);
            return { path: relative(root, f), size: stat.size, mtime: stat.mtime.toISOString() };
          });
          const payload = { room: target.label, path: target.path, files: files.length, fileList: filesWithMeta };
          return JSON.parse(truncateOutput(JSON.stringify(payload), CONFIG.maxToolOutputChars));
        }
        return { rooms: CONFIG.indexPaths.map(p => ({ label: p.label, path: p.path })) };
      }

      case 'auto_tag': {
        const tokens = tokenize(args.text);
        const tagScores = new Map();

        // From semantic expansions
        for (const token of tokens) {
          for (const [key, synonyms] of Object.entries(CONFIG.semanticExpansions)) {
            if (token === key || token.includes(key) || key.includes(token)) {
              tagScores.set(key, (tagScores.get(key) || 0) + 3);
              synonyms.forEach(s => tagScores.set(s, (tagScores.get(s) || 0) + 1));
            }
          }
        }

        // From cross-lingual
        for (const token of tokens) {
          if (CONFIG.crossLingual[token]) {
            tagScores.set(CONFIG.crossLingual[token], (tagScores.get(CONFIG.crossLingual[token]) || 0) + 2);
          }
          for (const [en, no] of Object.entries(CONFIG.crossLingual)) {
            if (no === token) tagScores.set(en, (tagScores.get(en) || 0) + 2);
          }
        }

        // From KG entities
        for (const entity of Object.keys(kgData)) {
          if (tokens.some(t => entity.includes(t) || t.includes(entity))) {
            tagScores.set(entity, (tagScores.get(entity) || 0) + 2);
          }
        }

        // From indexed file entities
        indexedDocs.forEach(d => {
          if (d.entities) {
            d.entities.tags?.forEach(t => {
              if (tokens.some(tok => t.toLowerCase().includes(tok) || tok.includes(t.toLowerCase()))) {
                tagScores.set(t, (tagScores.get(t) || 0) + 1);
              }
            });
          }
        });

        const sortedTags = [...tagScores.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, args.maxTags || 5)
          .map(([tag, score]) => ({ tag, score }));

        return { text: args.text.slice(0, 100), tags: sortedTags.map(t => t.tag), scored: sortedTags };
      }

      default:
        throw new Error(`Ukjent tool: ${name}`);
    }
  }
}

// ─── TRANSPORT ───
const mcp = new MempalaceMCP();

function sendMessage(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

process.stdin.setEncoding('utf8');
let buffer = '';

process.stdin.on('data', async (chunk) => {
  buffer += chunk;
  let lines = buffer.split('\n');
  buffer = lines.pop();

  for (const line of lines) {
    if (!line.trim()) continue;
    let req = null;
    try {
      req = JSON.parse(line);
    } catch (parseErr) {
      console.error('[MemPalace] Invalid JSON:', line.slice(0, 200));
      sendMessage({
        jsonrpc: '2.0', id: 0,
        error: { code: -32700, message: 'Parse error: ' + parseErr.message }
      });
      continue;
    }
    try {
      const result = await mcp.handleRequest(req);
      if (result === undefined) continue;
      sendMessage({ jsonrpc: '2.0', id: req.id ?? 0, result });
    } catch (err) {
      sendMessage({
        jsonrpc: '2.0',
        id: req.id ?? 0,
        error: { code: -32000, message: err.message }
      });
    }
  }
});

if (process.env.MEMPALACE_VERBOSE) {
  console.error('\u{1F3DB}\uFE0F  MemPalace MCP Server v3.5.0 — KIMI Code 0.11.0 Optimalisert');
  console.error(`   Wing: ${CONFIG.wing}`);
  console.error(`   Backend: in-memory FTS med inverted + bigram index (zero-dep)`);
  console.error(`   Scoring: TF-IDF + Bigram-boost + Kontekst-snippets`);
  console.error(`   Cache: LRU/${CONFIG.cacheSize}`);
  console.error(`   Persistens: ${CONFIG.indexCachePath}.gz (${(existsSync(resolve(root, CONFIG.indexCachePath + '.gz')) ? (statSync(resolve(root, CONFIG.indexCachePath + '.gz')).size / 1024 / 1024).toFixed(1) : '?')}MB)`);
  console.error(`   Cross-lingual: norsk↔engelsk (${Object.keys(CONFIG.crossLingual).length} mappings)`);
  console.error(`   File watcher: ${CONFIG.enableFileWatcher ? 'aktiv' : 'av'}`);
  console.error(`   Resources: mempalace://document/{path}, mempalace://kg/{entity}`);
  console.error(`   Prompts: pre_task, post_task, agent_auth, agent_architect, superkimi_boost`);
  console.error(`   KG Write: incremental append + auto-compact`);
  console.error(`   Output cap: ~${Math.round(CONFIG.maxToolOutputChars / 1000)}K chars (KIMI CLI v1.32.0+ 100K cap kompatibel)`);
  console.error(`   Kontekst: 262k (k2.6-optimized) | max_steps_per_turn=750`);
  console.error(`   Shutdown: SIGTERM/SIGINT graceful (flusher KG + index cache)`);
}

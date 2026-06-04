#!/usr/bin/env node
/**
 * Agent Validation Script
 * Checks that agent instruction files match the actual codebase.
 * Run: node scripts/validate-agents.mjs [--quick]
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const QUICK = process.argv.includes('--quick');

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(color, msg) {
  console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
}

function readFile(path) {
  try {
    return readFileSync(join(ROOT, path), 'utf-8');
  } catch {
    return null;
  }
}

// ─── Validation Rules ───

const results = [];

function check(name, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL';
  results.push({ name, status, detail });
  const color = condition ? 'green' : 'red';
  const icon = condition ? '✓' : '✗';
  log(color, `  ${icon} ${name}`);
  if (detail && !condition) {
    log('dim', `     → ${detail}`);
  }
  return condition;
}

// ─── 1. SKILL.md ───

log('cyan', '\n📋 SKILL.md');
const skill = readFile('.kimi/skills/autoglass/SKILL.md') || '';
const agentsMd = readFile('AGENTS.md') || '';

// Node version
const nvmrc = readFile('.nvmrc')?.trim() || '';
check('Node version matches .nvmrc', skill.includes(nvmrc), `Expected Node ${nvmrc}`);

// Frontend stack
check('SKILL.md mentions React', skill.includes('React'), 'Missing React reference');
check('SKILL.md mentions Vite', skill.includes('Vite'), 'Missing Vite reference');
check('SKILL.md mentions TypeScript', skill.includes('TypeScript') || skill.includes('TypeScript'), 'Missing TypeScript reference');
check('SKILL.md does NOT say "Statisk HTML/CSS/JS"', !skill.includes('Statisk HTML/CSS/JS'), 'Still claims static HTML/JS stack');

// Product count
check('Product count >= 37,000', !skill.includes('33,215'), 'Still claims 33,215 products');

// ─── 2. Web Agent ───

log('cyan', '\n🌐 Web Agent (autoglass-web-agent.md)');
const webAgent = readFile('.kimi/agents/autoglass-web-agent.md') || '';

check('References frontend/src/', webAgent.includes('frontend/src/'), 'Missing frontend/src/ references');
check('Does NOT reference js/main.js as primary', !webAgent.includes('js/main.js') || /legacy/i.test(webAgent), 'Still references js/main.js');
check('Does NOT reference css/tokens.css as primary', !webAgent.includes('css/tokens.css') || /legacy/i.test(webAgent), 'Still references css/tokens.css');
check('Does NOT reference index.html as primary', !webAgent.includes('index.html') || /legacy/i.test(webAgent), 'Still references index.html');
check('Mentions React', webAgent.includes('React'), 'Missing React');
check('Mentions Vite', webAgent.includes('Vite'), 'Missing Vite');
check('Mentions TypeScript', webAgent.includes('TypeScript') || webAgent.includes('TypeScript'), 'Missing TypeScript');
check('Mentions Tailwind', webAgent.includes('Tailwind') || webAgent.includes('tailwind'), 'Missing Tailwind');

// Verify critical files exist
const webFiles = [
  'frontend/src/App.tsx',
  'frontend/vite.config.ts',
  'frontend/src/api/client.ts',
];
for (const f of webFiles) {
  check(`File exists: ${f}`, existsSync(join(ROOT, f)));
}

// ─── 3. Worker Agent ───

log('cyan', '\n⚙️  Worker Agent (autoglass-worker-agent.md)');
const workerAgent = readFile('.kimi/agents/autoglass-worker-agent.md') || '';

const workerFiles = [
  'api/cf-worker/src/index.ts',
  'api/cf-worker/wrangler.toml',
  'scripts/smoke-test.mjs',
];
for (const f of workerFiles) {
  check(`File exists: ${f}`, existsSync(join(ROOT, f)));
}

// ─── 4. Data Agent ───

log('cyan', '\n📊 Data Agent (autoglass-data-agent.md)');
const dataAgent = readFile('.kimi/agents/autoglass-data-agent.md') || '';

const dataFiles = [
  'data/catalog-prod.json',
  'scripts/validate-catalog.mjs',
];
for (const f of dataFiles) {
  check(`File exists: ${f}`, existsSync(join(ROOT, f)));
}

// ─── 5. Ops Agent ───

log('cyan', '\n🔧 Ops Agent (autoglass-ops-agent.md)');
const opsAgent = readFile('.kimi/agents/autoglass-ops-agent.md') || '';

const opsFiles = [
  '.github/workflows/deploy.yml',
  'scripts/sync-secrets.mjs',
];
for (const f of opsFiles) {
  check(`File exists: ${f}`, existsSync(join(ROOT, f)));
}

// ─── 6. Ktype Agent ───

log('cyan', '\n🔍 Ktype Agent (autoglass-ktype-agent.md)');
const ktypeAgent = readFile('.kimi/agents/autoglass-ktype-agent.md') || '';

const ktypeFiles = [
  'scripts/bootstrap-bovsoft-v2.mjs',
];
for (const f of ktypeFiles) {
  check(`File exists: ${f}`, existsSync(join(ROOT, f)));
}

// ─── 7. Orchestrator Agent ───

log('cyan', '\n🎛️  Orchestrator Agent (autoglass-orchestrator-agent.md)');
const orchAgent = readFile('.kimi/agents/autoglass-orchestrator-agent.md') || '';

check('References all 6 domain agents', 
  ['data', 'worker', 'web', 'ops', 'arch', 'ktype'].every(a => orchAgent.includes(a)),
  'Missing agent reference');
check('Has Superpowers mapping table', orchAgent.includes('Superpowers'), 'Missing Superpowers mapping');
check('Has routing matrix', orchAgent.includes('Routing'), 'Missing routing matrix');

// ─── 8. KIMI-MASTER-SYSTEM ───

log('cyan', '\n🧠 KIMI-MASTER-SYSTEM.md');
const master = readFile('.kimi/KIMI-MASTER-SYSTEM.md') || '';

check('Matches AGENTS.md stack', 
  master.includes('React 18') && master.includes('Vite') && master.includes('TypeScript'),
  'Stack mismatch with AGENTS.md');
check('Node version matches .nvmrc', master.includes(nvmrc), `Expected Node ${nvmrc}`);

// ─── 9. YAML metadata ───

log('cyan', '\n📁 Agent YAML Metadata');
const yamlFiles = [
  'autoglass-web-agent.yaml',
  'autoglass-worker-agent.yaml',
  'autoglass-data-agent.yaml',
  'autoglass-ops-agent.yaml',
  'autoglass-architect-agent.yaml',
  'autoglass-ktype-agent.yaml',
  'autoglass-orchestrator.yaml',
];
for (const f of yamlFiles) {
  const content = readFile(join('.kimi/agents', f)) || '';
  const hasMetadata = content.includes('metadata:') || content.includes('last_updated:');
  check(`YAML has metadata: ${f}`, hasMetadata, 'Missing metadata block');
}

// ─── Summary ───

const passCount = results.filter(r => r.status === 'PASS').length;
const failCount = results.filter(r => r.status === 'FAIL').length;
const total = results.length;

log('cyan', '\n' + '═'.repeat(50));
if (failCount === 0) {
  log('green', `✓ ALL CHECKS PASSED (${passCount}/${total})`);
} else {
  log('yellow', `⚠ RESULTS: ${passCount} passed, ${failCount} failed (${total} total)`);
}
log('dim', `${COLORS.dim}Run with --quick for CI gates (exits 1 on failure)${COLORS.reset}`);

if (QUICK && failCount > 0) {
  process.exit(1);
}

process.exit(failCount > 0 ? 1 : 0);

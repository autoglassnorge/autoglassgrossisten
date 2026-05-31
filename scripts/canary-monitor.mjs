#!/usr/bin/env node
/**
 * Canary Monitor for React Deployment
 * ====================================
 * Overvåker app.auto-glass.no for feil før gradvis overgang
 * 
 * Kjøring:
 *   node scripts/canary-monitor.mjs
 *   node scripts/canary-monitor.mjs --interval=60  # sekunder
 */

const CANARY_URL = 'https://app.auto-glass.no';
const VANILLA_URL = 'https://auto-glass.no';

const CHECKS = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

async function checkHealth() {
  try {
    const res = await fetch(`${CANARY_URL}/api/health`);
    const data = await res.json();
    return { ok: data.status === 'ok', data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkMetrics() {
  try {
    const res = await fetch(`${CANARY_URL}/api/metrics`);
    const data = await res.json();
    return { 
      ok: data.requests?.errorRate < 0.05, 
      errorRate: data.requests?.errorRate,
      p95Latency: data.requests?.p95Latency
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkReact() {
  try {
    const res = await fetch(CANARY_URL);
    const html = await res.text();
    const hasRoot = html.includes('<div id="root">');
    const hasAssets = html.includes('/assets/');
    return { ok: hasRoot && hasAssets, hasRoot, hasAssets };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function runCheck() {
  CHECKS.total++;
  const timestamp = new Date().toISOString();
  
  console.log(`\n[${timestamp}] Check #${CHECKS.total}`);
  console.log('='.repeat(50));
  
  // Health check
  const health = await checkHealth();
  console.log(`Health API: ${health.ok ? '✅' : '❌'}`, health.data?.status || health.error);
  
  // Metrics check
  const metrics = await checkMetrics();
  console.log(`Error Rate: ${metrics.ok ? '✅' : '❌'} ${(metrics.errorRate * 100).toFixed(1)}% (target <5%)`);
  console.log(`P95 Latency: ${metrics.p95Latency}ms`);
  
  // React check
  const react = await checkReact();
  console.log(`React SPA: ${react.ok ? '✅' : '❌'} root=${react.hasRoot}, assets=${react.hasAssets}`);
  
  // Overall
  const allOk = health.ok && metrics.ok && react.ok;
  if (allOk) {
    CHECKS.passed++;
    console.log('Status: 🟢 ALL OK');
  } else {
    CHECKS.failed++;
    CHECKS.errors.push({ timestamp, health, metrics, react });
    console.log('Status: 🔴 FAILURES DETECTED');
  }
  
  console.log(`Pass rate: ${CHECKS.passed}/${CHECKS.total} (${(CHECKS.passed/CHECKS.total*100).toFixed(1)}%)`);
  
  return allOk;
}

async function main() {
  const args = process.argv.slice(2);
  const intervalArg = args.find(a => a.startsWith('--interval='));
  const interval = parseInt(intervalArg?.split('=')[1]) || 300; // default 5 min
  
  console.log('🚀 Canary Monitor Started');
  console.log(`URL: ${CANARY_URL}`);
  console.log(`Interval: ${interval}s`);
  console.log('Press Ctrl+C to stop\n');
  
  // First check immediately
  await runCheck();
  
  // Schedule next checks
  setInterval(runCheck, interval * 1000);
}

main().catch(console.error);

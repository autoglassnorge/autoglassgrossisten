import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import fs from 'fs';

const URLs = [
  'https://autoglass-frontend.pages.dev/',
  'https://autoglass-frontend.pages.dev/katalog.html',
  'https://autoglass-frontend.pages.dev/frontruter.html',
  'https://autoglass-frontend.pages.dev/bli-kunde.html',
];

const RESULTS = [];

async function runLighthouse(url) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'] });
  
  const runnerResult = await lighthouse(url, {
    logLevel: 'error',
    output: 'json',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    port: chrome.port,
  });

  await chrome.kill();

  const lhr = runnerResult.lhr;
  const scores = {
    url,
    performance: Math.round(lhr.categories.performance.score * 100),
    accessibility: Math.round(lhr.categories.accessibility.score * 100),
    bestPractices: Math.round(lhr.categories['best-practices'].score * 100),
    seo: Math.round(lhr.categories.seo.score * 100),
    lcp: lhr.audits['largest-contentful-paint'].numericValue,
    fid: lhr.audits['max-potential-fid']?.numericValue || 0,
    cls: lhr.audits['cumulative-layout-shift'].numericValue,
    tbt: lhr.audits['total-blocking-time'].numericValue,
    fcp: lhr.audits['first-contentful-paint'].numericValue,
    si: lhr.audits['speed-index'].numericValue,
  };

  // Key opportunities
  const opportunities = Object.values(lhr.audits)
    .filter(a => a.details?.type === 'opportunity' && a.numericValue > 0)
    .map(a => ({ title: a.title, savings: a.numericValue, score: a.score }))
    .sort((a, b) => b.savings - a.savings)
    .slice(0, 8);

  return { scores, opportunities };
}

for (const url of URLs) {
  try {
    console.log(`\n🔦 Running Lighthouse: ${url}`);
    const result = await runLighthouse(url);
    RESULTS.push(result);
    
    const s = result.scores;
    console.log(`  Performance:     ${s.performance}/100`);
    console.log(`  Accessibility:   ${s.accessibility}/100`);
    console.log(`  Best Practices:  ${s.bestPractices}/100`);
    console.log(`  SEO:             ${s.seo}/100`);
    console.log(`  LCP:             ${(s.lcp / 1000).toFixed(2)}s`);
    console.log(`  TBT:             ${(s.tbt / 1000).toFixed(2)}s`);
    console.log(`  CLS:             ${s.cls.toFixed(3)}`);
    console.log(`  Top opportunities:`);
    for (const opp of result.opportunities.slice(0, 5)) {
      console.log(`    • ${opp.title}: ${(opp.savings / 1000).toFixed(1)}s`);
    }
  } catch (e) {
    console.error(`❌ Failed for ${url}: ${e.message}`);
    RESULTS.push({ scores: { url, error: e.message }, opportunities: [] });
  }
}

fs.writeFileSync('lighthouse-results.json', JSON.stringify(RESULTS, null, 2));
console.log('\n✅ Results saved to lighthouse-results.json');

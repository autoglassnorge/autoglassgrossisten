import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import fs from 'fs';

const PAGES = [
  { url: 'https://autoglass-frontend.pages.dev/frontruter.html', name: 'frontruter' },
  { url: 'https://autoglass-frontend.pages.dev/bli-kunde.html', name: 'bli-kunde' },
  { url: 'https://autoglass-frontend.pages.dev/katalog.html', name: 'katalog' },
];

async function runDetailed(url, name) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'] });
  
  const runnerResult = await lighthouse(url, {
    logLevel: 'error',
    output: 'json',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    port: chrome.port,
  });

  await chrome.kill();
  const lhr = runnerResult.lhr;

  // Extract failing accessibility audits
  const a11yFails = Object.values(lhr.audits)
    .filter(a => a.score !== null && a.score < 1 && a.group === 'a11y-best-practices')
    .map(a => ({ id: a.id, title: a.title, score: a.score, description: a.description?.slice(0, 200) }));

  const a11yFailsAll = Object.values(lhr.audits)
    .filter(a => a.score !== null && a.score < 1)
    .map(a => ({ id: a.id, title: a.title, score: a.score }));

  // Extract SEO issues
  const seoFails = Object.values(lhr.audits)
    .filter(a => a.score !== null && a.score < 1 && a.group?.includes('seo'))
    .map(a => ({ id: a.id, title: a.title, score: a.score }));

  // Redirect chain
  const redirectAudit = lhr.audits['redirects'];

  return { name, url, a11yFails, a11yFailsAll, seoFails, redirectAudit };
}

const results = [];
for (const p of PAGES) {
  console.log(`\n🔍 ${p.name.toUpperCase()}`);
  const r = await runDetailed(p.url, p.name);
  results.push(r);

  console.log('\n  ❌ Accessibility failures:');
  for (const f of r.a11yFailsAll.slice(0, 10)) {
    console.log(`    • ${f.title} (score: ${f.score})`);
  }

  if (r.seoFails.length > 0) {
    console.log('\n  ❌ SEO failures:');
    for (const f of r.seoFails) {
      console.log(`    • ${f.title} (score: ${f.score})`);
    }
  }

  if (r.redirectAudit?.details?.items?.length > 0) {
    console.log('\n  🔄 Redirect chain:');
    for (const item of r.redirectAudit.details.items) {
      console.log(`    ${item.url} → ${item.statusCode}`);
    }
  }
}

fs.writeFileSync('lighthouse-detailed.json', JSON.stringify(results, null, 2));

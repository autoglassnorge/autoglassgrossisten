/**
 * BMW ETK / RealOEM local scraper using Playwright.
 * Fetches factory build sheet (S-codes) from BMW parts catalogs.
 * 
 * Usage: npx tsx scripts/bmw-etk-scraper.ts <VIN>
 * Output: JSON with S-codes and mapped features
 */

import { chromium } from 'playwright';

interface BMWScrapeResult {
  vin: string;
  sCodes: string[];
  features: {
    rainSensor?: boolean;
    heated?: boolean;
    acoustic?: boolean;
    hud?: boolean;
    camera?: boolean;
    laneAssist?: boolean;
    antenna?: boolean;
  };
  source: string;
  url: string;
}

const S_CODE_TO_FEATURES: Record<string, string[]> = {
  S521A: ['rainSensor'],
  S534A: ['heated'],
  S536A: ['acoustic'],
  S5ALA: ['acoustic'],
  S610A: ['hud'],
  S609A: ['camera'],
  S548A: ['camera'],
  S5A2A: ['laneAssist'],
  S5A1A: ['laneAssist', 'camera'],
  S5AT: ['laneAssist'],
  S693A: ['antenna'],
  S6AE: ['antenna'],
  S6AK: ['antenna'],
};

async function scrapeRealOEM(vin: string): Promise<BMWScrapeResult | null> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    const sources = [
      { name: 'bimmer.work', url: `https://bimmer.work/?vin=${vin}`, waitUntil: 'networkidle', waitMs: 5000 },
      { name: 'realoem.com', url: `https://www.realoem.com/bmw/enUS/select?vin=${vin}`, waitUntil: 'domcontentloaded', waitMs: 2000 },
    ];
    
    for (const source of sources) {
      try {
        console.log(`[bmw-etk] Trying ${source.name}...`);
        await page.goto(source.url, { waitUntil: source.waitUntil as any, timeout: 30000 });
        await page.waitForTimeout(source.waitMs);
        
        const pageContent = await page.content();
        const sCodes = extractSCodes(pageContent);
        
        if (sCodes.length > 0) {
          const features = mapSCodesToFeatures(sCodes);
          return { vin, sCodes, features, source: source.name, url: source.url };
        }
      } catch (e) {
        console.log(`[bmw-etk] ${source.name} failed: ${(e as Error).message}`);
      }
    }
    
    return null;
  } catch (e) {
    console.error(`[bmw-etk] Error scraping ${vin}:`, e);
    return null;
  } finally {
    await browser.close();
  }
}

function extractSCodes(html: string): string[] {
  const codes: string[] = [];
  const seen = new Set<string>();
  
  // Pattern 1: S followed by 3 digits and optional letter
  const pattern1 = /S\d{3}[A-Z]?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern1.exec(html)) !== null) {
    const code = m[0].toUpperCase();
    if (!seen.has(code) && code.length >= 4 && code.length <= 7) {
      seen.add(code);
      codes.push(code);
    }
  }
  
  // Pattern 2: S-code labels
  const pattern2 = /S[- ]?code\s*[:=]?\s*(S\d{3}[A-Z]?)/gi;
  while ((m = pattern2.exec(html)) !== null) {
    const code = m[1].toUpperCase();
    if (!seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }
  
  return codes;
}

function mapSCodesToFeatures(sCodes: string[]): Record<string, boolean> {
  const features: Record<string, boolean> = {};
  const seen = new Set<string>();
  
  for (const code of sCodes) {
    const mapped = S_CODE_TO_FEATURES[code];
    if (mapped) {
      for (const f of mapped) {
        if (!seen.has(f)) {
          seen.add(f);
          features[f] = true;
        }
      }
    }
  }
  
  return features;
}

async function main() {
  const vin = process.argv[2];
  if (!vin) {
    console.log('Usage: npx tsx scripts/bmw-etk-scraper.ts <VIN>');
    process.exit(1);
  }

  console.log(`[bmw-etk] Scraping BMW build sheet for VIN: ${vin}`);
  const result = await scrapeRealOEM(vin);
  
  if (result) {
    console.log('\n=== RESULT ===');
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('No S-codes found. Vehicle may not be in BMW database or site blocks scraping.');
  }
}

main();

import { JSDOM } from 'jsdom';

async function scrapeDominion() {
  const res = await fetch('https://dominionautoglass.ca/vintage-windshield-parts-patterns/');
  const html = await res.text();
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  const entries = [];
  
  // Find all tables - the first one is "Vintage Windshield Parts in Stock"
  const tables = doc.querySelectorAll('table');
  
  for (const table of tables) {
    const rows = table.querySelectorAll('tr');
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 7) {
        const partNum = cells[0]?.textContent?.trim() || '';
        const tint = cells[1]?.textContent?.trim() || '';
        const type = cells[2]?.textContent?.trim() || '';
        const condition = cells[3]?.textContent?.trim() || '';
        const year = cells[4]?.textContent?.trim() || '';
        const make = cells[5]?.textContent?.trim() || '';
        const model = cells[6]?.textContent?.trim() || '';
        
        // Only extract modern NAGS codes (DW, FW, DB, FB, DD, FD, DQ, FQ, DV, FV, etc.)
        const nagsMatch = partNum.match(/^([A-Z]{2}\d{4,5}[A-Z]?)/);
        if (nagsMatch && year && make) {
          entries.push({
            nagsCode: nagsMatch[1],
            suffix: null,
            make,
            model,
            yearRange: year,
            glassType: type,
            tint,
            condition,
            source: 'dominionautoglass.ca'
          });
        }
      }
    }
  }
  
  console.log('Extracted', entries.length, 'entries from Dominion Auto Glass');
  
  // Save
  const fs = await import('fs');
  fs.writeFileSync('data/nags-dominion.json', JSON.stringify({
    meta: { count: entries.length, source: 'dominionautoglass.ca', scrapedAt: new Date().toISOString() },
    entries
  }, null, 2));
  
  // Summary by make
  const byMake = {};
  for (const e of entries) {
    byMake[e.make] = (byMake[e.make] || 0) + 1;
  }
  console.log('By make:', Object.entries(byMake).sort((a,b) => b[1]-a[1]).slice(0, 15));
}

scrapeDominion().catch(console.error);

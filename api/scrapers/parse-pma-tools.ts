/**
 * Parse PMA/TOOLS Automotive Glass Accessories PDF text
 * Extracts make, model, year, description, and Eurocode
 */
import * as fs from "fs";
import * as path from "path";

interface PmaEntry {
  make: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  description: string;
  eurocode: string;
  oeNumber: string | null;
  characteristic: string | null;
}

function parsePmaToolsText(textPath: string): PmaEntry[] {
  const text = fs.readFileSync(textPath, "utf-8");
  const lines = text.split(/\r?\n/);
  const entries: PmaEntry[] = [];

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    const nextLine = lines[i + 1]?.trim() || "";

    if (!nextLine.startsWith("Eurocode:")) continue;

    // Pattern: "MAKE MODEL, YY-YY, Description"
    const euroMatch = nextLine.match(/Eurocode:\s*(\S+)/);
    if (!euroMatch) continue;
    const eurocode = euroMatch[1];

    // Parse make/model/year/description
    // Example: "ALFA ROMEO 145, 94-00, WS-Cover moulding soft"
    // Example: "TOYOTA Land Cruiser J12, 02-09, WS-Dam profile self-adhesive, 3530 mm"
    const lineMatch = line.match(/^([A-Z][A-Z\s]+?)\s+(.+?),\s*(\d{2})-(\d{2}),\s*(.+)$/);
    if (!lineMatch) continue;

    const make = lineMatch[1].trim();
    const model = lineMatch[2].trim();
    const yearFrom = parseInt(lineMatch[3]);
    const yearTo = parseInt(lineMatch[4]);
    const description = lineMatch[5].trim();

    // Handle 2-digit years (assume 19xx or 20xx)
    const fullYearFrom = yearFrom >= 50 ? 1900 + yearFrom : 2000 + yearFrom;
    const fullYearTo = yearTo >= 50 ? 1900 + yearTo : 2000 + yearTo;

    // Look ahead for OE number and characteristic
    let oeNumber: string | null = null;
    let characteristic: string | null = null;
    for (let j = i + 2; j < Math.min(i + 6, lines.length); j++) {
      const ahead = lines[j].trim();
      if (ahead.startsWith("Equivalent to OE No.:")) {
        oeNumber = ahead.replace("Equivalent to OE No.:", "").trim();
      } else if (ahead.startsWith("Characteristic:")) {
        characteristic = ahead.replace("Characteristic:", "").trim();
      } else if (ahead.match(/^[A-Z].+Eurocode:/)) {
        break;
      }
    }

    entries.push({
      make,
      model,
      yearFrom: fullYearFrom,
      yearTo: fullYearTo,
      description,
      eurocode,
      oeNumber,
      characteristic,
    });
  }

  return entries;
}

const TEXT_PATH = path.join(process.cwd(), "data", "pma-tools-2016.txt");
const OUTPUT_PATH = path.join(process.cwd(), "data", "pma-tools-parsed.json");

console.log("🔍 Parsing PMA/TOOLS text...");
const entries = parsePmaToolsText(TEXT_PATH);

// Deduplicate by eurocode
const seen = new Set<string>();
const unique = entries.filter((e) => {
  if (seen.has(e.eurocode)) return false;
  seen.add(e.eurocode);
  return true;
});

console.log(`📊 Extracted ${entries.length} entries, ${unique.length} unique Eurocodes`);

// Stats
const byMake: Record<string, number> = {};
for (const e of unique) {
  byMake[e.make] = (byMake[e.make] || 0) + 1;
}
console.log("\n🏷️ Top makes:");
Object.entries(byMake)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([make, count]) => console.log(`   ${make}: ${count}`));

fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ entries: unique, meta: { total: unique.length, extractedAt: new Date().toISOString() } }, null, 2));
console.log(`\n💾 Saved to ${OUTPUT_PATH}`);

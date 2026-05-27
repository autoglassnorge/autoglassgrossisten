/**
 * Nord Glass — PDF Extractor
 * Konverterer PDF til rå linjer klar for parsing.
 *
 * Dependencies:
 *   - pdftotext (poppler-utils) eller
 *   - pdfplumber (Python) som fallback
 *
 * Usage:
 *   const lines = await extractFromPDF('659486770-Nord-Glass.pdf');
 *
 * CLI:
 *   npx tsx lib/nordglass/extract.ts extract <pdf> [output.txt]
 *   npx tsx lib/nordglass/extract.ts parse <lines.txt>
 *   npx tsx lib/nordglass/extract.ts full <pdf> [output.sql]
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

export interface ExtractOptions {
  /** Minste lengde for en gyldig rad */
  minLineLength?: number;
  /** Filtrer rader som ikke inneholder produktfamilie */
  requireProductFamily?: boolean;
}

const DEFAULT_OPTIONS: ExtractOptions = {
  minLineLength: 20,
  requireProductFamily: true,
};

// Bruker samme regex som tokenize — trenger ikke \b fordi familie kan være sammenhengende med år
const PRODUCT_FAMILIES = /(WSWS|RWRW|BOT|BOD|BOS|BOAS|GUGU)/;

/**
 * Ekstraher rå linjer fra Nord Glass PDF.
 *
 * Strategi:
 * 1. pdftotext -layout (beholder kolonne-layout)
 * 2. Split på newline
 * 3. Trim og filtrer
 */
export async function extractFromPDF(
  pdfPath: string,
  options: ExtractOptions = {}
): Promise<string[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }

  // 1. Prøv pdftotext først
  let rawText: string;
  try {
    rawText = execSync(`pdftotext -layout "${pdfPath}" -`, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB for store kataloger
    });
  } catch (e) {
    throw new Error(`pdftotext failed: ${e}`);
  }

  // 2. Split og rens
  const lines = rawText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length >= (opts.minLineLength || 0));

  // 3. Filtrer rader uten produktfamilie (header/footer/søppel)
  if (opts.requireProductFamily) {
    return lines.filter(line => PRODUCT_FAMILIES.test(line));
  }

  return lines;
}

/**
 * Ekstraher og lagre til fil (for debugging).
 */
export async function extractAndSave(
  pdfPath: string,
  outputPath: string,
  options?: ExtractOptions
): Promise<{ count: number; outputPath: string }> {
  const { writeFileSync } = await import('fs');
  const lines = await extractFromPDF(pdfPath, options);
  writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  return { count: lines.length, outputPath };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || args.includes('--help') || args.includes('-h')) {
    console.log(`
Nord Glass PDF Extractor CLI

Usage:
  npx tsx lib/nordglass/extract.ts extract <pdf> [output.txt]
  npx tsx lib/nordglass/extract.ts parse  <lines.txt> [output.sql]
  npx tsx lib/nordglass/extract.ts full    <pdf> [output.sql]

Commands:
  extract  — Extract lines from PDF to text file
  parse    — Parse existing lines file through pipeline
  full     — Extract + parse + generate SQL in one step
`);
    process.exit(0);
  }

  if (command === 'extract') {
    const pdfPath = args[1];
    const outputPath = args[2] || 'nordglass-lines.txt';
    if (!pdfPath) {
      console.error('Error: PDF path required');
      process.exit(1);
    }
    const result = await extractAndSave(pdfPath, outputPath);
    console.log(`Extracted ${result.count} lines → ${result.outputPath}`);
    return;
  }

  if (command === 'parse') {
    const linesPath = args[1];
    const outputPath = args[2] || 'nordglass-staging.sql';
    if (!linesPath) {
      console.error('Error: lines file path required');
      process.exit(1);
    }
    const { pipeline, parseLine } = await import('./index');
    const rawLines = readFileSync(linesPath, 'utf-8').split('\n').filter(Boolean);
    const result = pipeline(rawLines, parseLine);
    const { writeFileSync } = await import('fs');
    writeFileSync(outputPath, result.stagingSQL, 'utf-8');
    console.log(`Parsed ${result.stats.total} lines → ${outputPath}`);
    console.log(`  OK: ${result.stats.ok}, REVIEW: ${result.stats.review}, HOLD: ${result.stats.hold}`);
    return;
  }

  if (command === 'full') {
    const pdfPath = args[1];
    const outputPath = args[2] || 'nordglass-staging.sql';
    if (!pdfPath) {
      console.error('Error: PDF path required');
      process.exit(1);
    }
    const lines = await extractFromPDF(pdfPath);
    const { pipeline, parseLine } = await import('./index');
    const result = pipeline(lines, parseLine);
    const { writeFileSync } = await import('fs');
    writeFileSync(outputPath, result.stagingSQL, 'utf-8');
    console.log(`Full pipeline: ${lines.length} lines extracted → ${outputPath}`);
    console.log(`  OK: ${result.stats.ok}, REVIEW: ${result.stats.review}, HOLD: ${result.stats.hold}`);
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

if (require.main === module || import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}

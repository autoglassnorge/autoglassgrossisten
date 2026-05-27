#!/usr/bin/env node
/**
 * Nord Glass — CLI Ingest Tool
 *
 * Usage:
 *   npx tsx lib/nordglass/cli.ts extract 659486770-Nord-Glass.pdf --output nordglass.txt
 *   npx tsx lib/nordglass/cli.ts parse nordglass.txt --output nordglass-staging.sql
 *   npx tsx lib/nordglass/cli.ts full 659486770-Nord-Glass.pdf --output nordglass-staging.sql
 */

import { extractFromPDF, extractAndSave } from './extract';
import { parseLine } from './parse-line';
import { pipeline } from './importer';
import { readFileSync, writeFileSync } from 'fs';

async function main() {
  const [cmd, inputPath, ...args] = process.argv.slice(2);
  const outputFlag = args.indexOf('--output');
  const outputPath = outputFlag >= 0 ? args[outputFlag + 1] : undefined;

  if (!cmd || !inputPath) {
    console.log(`
Nord Glass Ingest CLI

Usage:
  tsx cli.ts extract <pdf> [--output lines.txt]     Extract lines from PDF
  tsx cli.ts parse <lines.txt> [--output staging.sql] Parse lines to staging SQL
  tsx cli.ts full <pdf> [--output staging.sql]        Extract + parse in one go
`);
    process.exit(1);
  }

  if (cmd === 'extract') {
    const out = outputPath || inputPath.replace('.pdf', '.txt');
    const { count } = await extractAndSave(inputPath, out);
    console.log(`✅ Extracted ${count} lines to ${out}`);
    return;
  }

  if (cmd === 'parse') {
    const out = outputPath || inputPath.replace('.txt', '-staging.sql');
    const lines = readFileSync(inputPath, 'utf-8').split('\n');
    const { stagingSQL, stats } = pipeline(lines, parseLine);
    writeFileSync(out, stagingSQL);
    console.log(`✅ Parsed ${stats.total} lines → ${out}`);
    console.log(`   OK: ${stats.ok} | REVIEW: ${stats.review} | HOLD: ${stats.hold}`);
    return;
  }

  if (cmd === 'full') {
    const out = outputPath || inputPath.replace('.pdf', '-staging.sql');
    const lines = await extractFromPDF(inputPath);
    const { stagingSQL, stats } = pipeline(lines, parseLine);
    writeFileSync(out, stagingSQL);
    console.log(`✅ Full pipeline: ${stats.total} lines → ${out}`);
    console.log(`   OK: ${stats.ok} | REVIEW: ${stats.review} | HOLD: ${stats.hold}`);
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

main().catch(e => { console.error('❌', e); process.exit(1); });

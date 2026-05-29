/**
 * Benchmark: KV chunks vs D1 SELECT
 * ==================================
 * Kjør etter D1-migrering er fullført og Worker er deployet med D1-støtte.
 *
 * Kjøring:
 *   npx tsx scripts/benchmark-d1.ts
 *
 * Dette scriptet tester 10 representative søk og sammenligner
 * responstid mellom KV (full catalog load) og D1 (indeksert query).
 */

const WORKER_URL = "https://autoglass-glass-sok.autoglassnorge.workers.dev";

const TEST_CASES = [
  { regnr: "SU18018", description: "VW Transporter (kjent i katalog)" },
  { regnr: "AB12345", description: "BMW 3-serie (kjent i katalog)" },
  { regnr: "CD67890", description: "VW Golf (kjent i katalog)" },
  { regnr: "EF11111", description: "Mercedes C (kjent i katalog)" },
  { regnr: "GH22222", description: "Volvo XC60 (kjent i katalog)" },
  { regnr: "XY99999", description: "Ukjent regnr (fallback)" },
  { regnr: "SU18018", type: "frontrute", description: "Med glass-type filter" },
  { regnr: "SU18018", type: "siderute", description: "Med glass-type filter 2" },
  { regnr: "SU18018", type: "bakrute", description: "Med glass-type filter 3" },
  { regnr: "SU18018", type: "tak", description: "Med glass-type filter 4" },
];

interface BenchmarkResult {
  description: string;
  kvMs: number;
  d1Ms: number;
  speedup: number;
  kvCandidates: number;
  d1Candidates: number;
}

async function benchmarkSearch(params: Record<string, string>): Promise<{ kvMs: number; d1Ms: number; kvCandidates: number; d1Candidates: number }> {
  const queryString = new URLSearchParams(params).toString();

  // KV (force source=kv)
  const kvStart = Date.now();
  const kvRes = await fetch(`${WORKER_URL}/api/glass?${queryString}&source=kv`);
  const kvMs = Date.now() - kvStart;
  const kvData = await kvRes.json() as any;

  // D1 (force source=d1)
  const d1Start = Date.now();
  const d1Res = await fetch(`${WORKER_URL}/api/glass?${queryString}&source=d1`);
  const d1Ms = Date.now() - d1Start;
  const d1Data = await d1Res.json() as any;

  return {
    kvMs,
    d1Ms,
    kvCandidates: kvData.candidates?.length || 0,
    d1Candidates: d1Data.candidates?.length || 0,
  };
}

async function main() {
  console.log("⚡ Benchmark: KV chunks vs D1 SELECT");
  console.log("====================================\n");
  console.log(`Worker: ${WORKER_URL}\n`);

  const results: BenchmarkResult[] = [];

  for (const tc of TEST_CASES) {
    const params: Record<string, string> = { regnr: tc.regnr };
    if (tc.type) params.type = tc.type;

    process.stdout.write(`  🧪 ${tc.description} ... `);

    try {
      const { kvMs, d1Ms, kvCandidates, d1Candidates } = await benchmarkSearch(params);
      const speedup = kvMs / Math.max(d1Ms, 1);

      results.push({
        description: tc.description,
        kvMs,
        d1Ms,
        speedup,
        kvCandidates,
        d1Candidates,
      });

      console.log(`KV=${kvMs}ms D1=${d1Ms}ms ${speedup.toFixed(1)}×`);

      // Sanity check: begge skal returnere samme antall kandidater
      if (kvCandidates !== d1Candidates) {
        console.warn(`     ⚠️  Ulikt antall kandidater: KV=${kvCandidates} D1=${d1Candidates}`);
      }
    } catch (e) {
      console.error(`❌ Feil: ${(e as Error).message}`);
    }
  }

  console.log("\n📊 Oppsummering");
  console.log("================");

  const avgKv = results.reduce((s, r) => s + r.kvMs, 0) / results.length;
  const avgD1 = results.reduce((s, r) => s + r.d1Ms, 0) / results.length;
  const avgSpeedup = avgKv / Math.max(avgD1, 1);

  console.log(`   Gjennomsnitt KV:  ${avgKv.toFixed(0)}ms`);
  console.log(`   Gjennomsnitt D1:  ${avgD1.toFixed(0)}ms`);
  console.log(`   Speedup:          ${avgSpeedup.toFixed(1)}×`);
  console.log("");

  // Markdown-tabell
  console.log("| Test | KV (ms) | D1 (ms) | Speedup |");
  console.log("|------|---------|---------|---------|");
  for (const r of results) {
    console.log(`| ${r.description} | ${r.kvMs} | ${r.d1Ms} | ${r.speedup.toFixed(1)}× |`);
  }

  console.log("\n✅ Ferdig. Lim inn markdown-tabellen i docs/ARCHITECTURE-PLAN.md under D1-benchmark.");
}

main().catch((e) => {
  console.error("❌ Feil:", e.message);
  process.exit(1);
});

export interface AccuracyMetrics {
  total: number;
  top1: number;
  top3: number;
  top5: number;
  byCategory: Record<string, { total: number; top1: number; top3: number; top5: number }>;
  failures: Array<{
    regnr: string;
    category: string;
    expected: string[];
    predicted: string[];
    bucket: string;
    layer: number;
    confidence: string;
  }>;
}

export function computeMetrics(
  results: AccuracyMetrics["failures"],
  total: number
): AccuracyMetrics {
  const byCategory: AccuracyMetrics["byCategory"] = {};
  let top1 = 0;
  let top3 = 0;
  let top5 = 0;

  for (const r of results) {
    const cat = r.category;
    if (!byCategory[cat]) {
      byCategory[cat] = { total: 0, top1: 0, top3: 0, top5: 0 };
    }
    byCategory[cat].total++;

    const setExpected = new Set(r.expected.filter(Boolean));
    if (setExpected.size === 0) continue;

    const pred = r.predicted;
    if (pred.slice(0, 1).some((p) => setExpected.has(p))) {
      top1++;
      byCategory[cat].top1++;
    }
    if (pred.slice(0, 3).some((p) => setExpected.has(p))) {
      top3++;
      byCategory[cat].top3++;
    }
    if (pred.slice(0, 5).some((p) => setExpected.has(p))) {
      top5++;
      byCategory[cat].top5++;
    }
  }

  const failures = results.filter((r) => {
    const setExpected = new Set(r.expected);
    return !r.predicted.slice(0, 3).some((p) => setExpected.has(p));
  });

  return { total, top1, top3, top5, byCategory, failures };
}

export function printReport(metrics: AccuracyMetrics): void {
  console.log("\n=== Search Accuracy Report ===");
  console.log(`Total cases: ${metrics.total}`);
  if (metrics.total === 0) {
    console.log("No cases evaluated.");
    return;
  }
  console.log(
    `Top-1: ${metrics.top1}/${metrics.total} (${((metrics.top1 / metrics.total) * 100).toFixed(1)}%)`
  );
  console.log(
    `Top-3: ${metrics.top3}/${metrics.total} (${((metrics.top3 / metrics.total) * 100).toFixed(1)}%)`
  );
  console.log(
    `Top-5: ${metrics.top5}/${metrics.total} (${((metrics.top5 / metrics.total) * 100).toFixed(1)}%)`
  );
  console.log("\nBy category:");
  for (const [cat, m] of Object.entries(metrics.byCategory)) {
    const t1 = m.total ? ((m.top1 / m.total) * 100).toFixed(1) : "0.0";
    const t3 = m.total ? ((m.top3 / m.total) * 100).toFixed(1) : "0.0";
    const t5 = m.total ? ((m.top5 / m.total) * 100).toFixed(1) : "0.0";
    console.log(
      `  ${cat}: top-1 ${t1}%, top-3 ${t3}%, top-5 ${t5}% (${m.top1}/${m.total})`
    );
  }
  console.log(`\nFailures: ${metrics.failures.length}`);
  for (const f of metrics.failures.slice(0, 20)) {
    console.log(
      `  ${f.regnr} ${f.category}: expected ${f.expected.join(", ")} | predicted ${f.predicted.join(", ")} (layer=${f.layer}, confidence=${f.confidence})`
    );
  }
  if (metrics.failures.length > 20) {
    console.log(`  ... and ${metrics.failures.length - 20} more`);
  }
}

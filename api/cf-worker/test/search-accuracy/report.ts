export interface FailureDetail {
  regnr: string;
  category: string;
  expected: string[];
  predicted: string[];
  allCandidates?: string[];
  bucket: string;
  layer: number;
  confidence: string;
  make?: string;
  model?: string;
  year?: number;
  ktype?: number;
  expectedKtype?: number;
  topKtype?: number;
  vin?: string;
  vinDecode?: { make?: string; generation?: string; body?: string } | null;
}

export interface AccuracyMetrics {
  total: number;
  top1: number;
  top3: number;
  top5: number;
  byCategory: Record<string, { total: number; top1: number; top3: number; top5: number }>;
  failures: FailureDetail[];
  byBucket: Record<string, number>;
}

export function classifyFailure(r: FailureDetail): string {
  // VIN decode error: VIN present but decode produced nothing or mismatched make/generation.
  if (r.vin && r.vin.length >= 8) {
    const decoded = r.vinDecode;
    if (!decoded) return "vin_decode_error";
    if (decoded.make && r.make && decoded.make.toUpperCase() !== normalizeBrandForBucket(r.make)) {
      return "vin_decode_error";
    }
  }

  const expectedSet = new Set(r.expected.filter(Boolean));
  const all = r.allCandidates ?? r.predicted;
  const expectedPresent = all.some((c) => expectedSet.has(c));

  // Missing candidate: expected eurocode never surfaced.
  if (!expectedPresent) {
    if (r.layer === 0 && r.ktype && r.expectedKtype && r.ktype !== r.expectedKtype) {
      return "wrong_ktype";
    }
    if (r.layer === 0) return "missing_candidate";
    if (r.layer === 1) return "year/generation_gate";
    return "model_alias_miss";
  }

  // Expected surfaced but did not rank in top-3.
  if (r.layer === 0 && r.ktype && r.expectedKtype && r.ktype !== r.expectedKtype) {
    return "wrong_ktype";
  }
  if (r.layer === 1) return "year/generation_gate";
  if (r.layer >= 2) return "model_alias_miss";

  // Layer -1 should never fail; if it does, treat as equipment mismatch.
  return "equipment_mismatch";
}

function normalizeBrandForBucket(brand: string): string {
  const map: Record<string, string> = {
    VOLKSWAGEN: "VW",
    "MERCEDES-BENZ": "MERCEDES",
  };
  return map[brand.toUpperCase()] || brand.toUpperCase();
}

export function computeMetrics(
  results: FailureDetail[],
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

  for (const f of failures) {
    f.bucket = classifyFailure(f);
  }

  const byBucket: Record<string, number> = {};
  for (const f of failures) {
    byBucket[f.bucket] = (byBucket[f.bucket] || 0) + 1;
  }

  return { total, top1, top3, top5, byCategory, failures, byBucket };
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
  if (metrics.failures.length > 0) {
    console.log("\nBy bucket:");
    for (const [bucket, count] of Object.entries(metrics.byBucket).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${bucket}: ${count}`);
    }
  }
  for (const f of metrics.failures.slice(0, 20)) {
    console.log(
      `  ${f.regnr} ${f.category}: expected ${f.expected.join(", ")} | predicted ${f.predicted.join(", ")} (layer=${f.layer}, confidence=${f.confidence}, bucket=${f.bucket})`
    );
  }
  if (metrics.failures.length > 20) {
    console.log(`  ... and ${metrics.failures.length - 20} more`);
  }
}

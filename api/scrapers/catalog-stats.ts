/**
 * Catalog Statistics & Analysis
 * Analyzes master catalog and individual sources
 */

import * as fs from "fs";
import * as path from "path";

interface Product {
  eurocode: string;
  brand?: string;
  model?: string;
  yearFrom?: number;
  yearTo?: number;
  type?: string;
  category?: string;
  flags?: string[];
}

function loadProducts(filePath: string): Product[] {
  if (!fs.existsSync(filePath)) return [];
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return data.records || data;
}

function analyze(products: Product[], label: string) {
  console.log(`\n📊 ${label} — ${products.length} produkter`);

  // Brand distribution
  const brands = new Map<string, number>();
  for (const p of products) {
    const b = (p.brand || "UNKNOWN").toUpperCase();
    brands.set(b, (brands.get(b) || 0) + 1);
  }
  console.log(`   Topp 10 merker:`);
  for (const [b, c] of Array.from(brands.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`      ${b}: ${c}`);
  }

  // Type distribution
  const types = new Map<string, number>();
  for (const p of products) {
    const t = p.type || p.category || "UNKNOWN";
    types.set(t, (types.get(t) || 0) + 1);
  }
  console.log(`   Type-fordeling:`);
  for (const [t, c] of Array.from(types.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${t}: ${c}`);
  }

  // Year range
  const years = products.map(p => p.yearFrom).filter((y): y is number => y !== undefined && y !== null);
  if (years.length > 0) {
    const min = Math.min(...years);
    const max = Math.max(...years);
    console.log(`   Årstall: ${min}–${max}`);
  }

  // Unique eurocodes (prefix4)
  const prefix4s = new Set(products.map(p => p.eurocode?.slice(0, 4)).filter(Boolean));
  console.log(`   Unike prefix4: ${prefix4s.size}`);
}

function main() {
  console.log("📈 Katalog-statistikk");
  console.log("=====================\n");

  // Analyze each source
  const sources = [
    { path: "data/glavista-catalog.json", label: "Glavista" },
    { path: "data/mock-katalog.json", label: "Mock" },
    { path: "data/master-catalog.json", label: "Master (merged)" },
  ];

  for (const src of sources) {
    const products = loadProducts(path.join(process.cwd(), src.path));
    if (products.length > 0) {
      analyze(products, src.label);
    } else {
      console.log(`\n⚠️  ${src.label}: ikke funnet`);
    }
  }

  // Pilkington checkpoint (if exists)
  const pilkCheckpoint = path.join(process.cwd(), "data", "scrapers", "pilkington-checkpoint.json");
  if (fs.existsSync(pilkCheckpoint)) {
    const data = JSON.parse(fs.readFileSync(pilkCheckpoint, "utf-8"));
    analyze(data.products || [], "Pilkington (checkpoint)");
  }
}

main();

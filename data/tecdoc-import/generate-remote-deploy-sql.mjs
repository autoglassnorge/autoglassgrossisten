import { readFileSync, writeFileSync } from "fs";

console.log("📝 Generating remote deploy SQL...");

// Read all the SQL files and combine into one clean file (no transactions)
const krSql = readFileSync("data/tecdoc-import/ktype-registry-inserts.sql", "utf-8");
const grSql = readFileSync("data/tecdoc-import/glass-rules-inserts-fixed.sql", "utf-8");
const gcSql = readFileSync("data/tecdoc-import/glass-catalog-updates.sql", "utf-8");

function stripTransactions(sql) {
  return sql
    .split("\n")
    .filter(l => {
      const t = l.trim().toUpperCase();
      return l.trim() && !t.startsWith("--") && !t.startsWith("BEGIN") && !t.startsWith("COMMIT");
    })
    .join("\n");
}

let output = "-- Remote deploy SQL for TecDoc 1Q2019 kType enrichment\n";
output += "-- Generated: " + new Date().toISOString() + "\n\n";

output += "-- 1. Ensure tables exist\n";
output += `CREATE TABLE IF NOT EXISTS ktype_registry (
  ktype INTEGER PRIMARY KEY,
  brand TEXT,
  model TEXT,
  year_from INTEGER,
  year_to INTEGER,
  body TEXT,
  source TEXT,
  confidence TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ktype_registry_brand ON ktype_registry(brand);
CREATE INDEX IF NOT EXISTS idx_ktype_registry_model ON ktype_registry(model);
\n`;

output += "-- 2. ktype_registry inserts (784 rows)\n";
output += stripTransactions(krSql) + "\n\n";

output += "-- 3. glass_rules inserts (972 rows)\n";
output += stripTransactions(grSql) + "\n\n";

output += "-- 4. glass_catalog ktype updates (9342 rows)\n";
output += stripTransactions(gcSql) + "\n\n";

writeFileSync("data/tecdoc-import/remote-deploy.sql", output);
console.log(`   → ${output.split("\n").length} lines`);
console.log(`   → Saved to data/tecdoc-import/remote-deploy.sql`);

import { readFileSync, writeFileSync } from "fs";

function stripCommentsAndTx(sql) {
  return sql.split("\n").filter(l => {
    const t = l.trim();
    return t && !t.startsWith("--");
  }).join("\n");
}

const kr = stripCommentsAndTx(readFileSync("data/tecdoc-import/ktype-registry-inserts-v5.sql", "utf-8"));
const gr = stripCommentsAndTx(readFileSync("data/tecdoc-import/glass-rules-inserts-v5.sql", "utf-8"));
const gc = stripCommentsAndTx(readFileSync("data/tecdoc-import/glass-catalog-updates-v5.sql", "utf-8"));

let output = "-- Remote deploy SQL for TecDoc 1Q2019 kType enrichment (v5)\n";
output += "-- Generated: " + new Date().toISOString() + "\n";
output += "-- Coverage: 11,294 / 18,737 records (60.3%)\n\n";

output += "-- 1. Ensure tables exist\n";
output += `CREATE TABLE IF NOT EXISTS ktype_registry (
  ktype INTEGER PRIMARY KEY, brand TEXT, model TEXT, year_from INTEGER,
  year_to INTEGER, body TEXT, source TEXT, confidence TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ktype_registry_brand ON ktype_registry(brand);
CREATE INDEX IF NOT EXISTS idx_ktype_registry_model ON ktype_registry(model);
`;
output += `CREATE TABLE IF NOT EXISTS glass_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT, normalized_key TEXT NOT NULL,
  market TEXT, opening TEXT, feature_signature TEXT, ktype INTEGER, kba TEXT,
  nags TEXT, oem_part_number TEXT, eurocode TEXT, confidence REAL,
  evidence_count INTEGER, last_verified_at DATETIME, active INTEGER,
  notes TEXT, created_at DATETIME, updated_at DATETIME
);
`;
output += "\n-- 2. Clear existing TecDoc data (idempotent)\n";
output += "DELETE FROM ktype_registry WHERE source = 'tecdoc_1q2019';\n";
output += "DELETE FROM glass_rules WHERE notes = 'tecdoc_1q2019';\n";
output += "UPDATE glass_catalog SET ktype = NULL WHERE ktype IS NOT NULL;\n\n";

output += "-- 3. ktype_registry inserts (907 rows)\n" + kr + "\n\n";
output += "-- 4. glass_rules inserts (1182 rows)\n" + gr + "\n\n";
output += "-- 5. glass_catalog updates (11294 rows)\n" + gc + "\n";

writeFileSync("data/tecdoc-import/remote-deploy-v5.sql", output);
console.log("💾 remote-deploy-v5.sql generated");
console.log("   Lines: " + output.split("\n").length);

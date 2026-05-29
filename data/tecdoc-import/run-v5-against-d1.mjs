import { readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";

const SQL_DIR = "data/tecdoc-import/d1-chunks-v5";
try { rmSync(SQL_DIR, { recursive: true }); } catch {}
mkdirSync(SQL_DIR, { recursive: true });

function runFile(path, prefix) {
  const text = readFileSync(path, "utf-8");
  const lines = text.split("\n").filter(l => {
    const trimmed = l.trim();
    return trimmed && !trimmed.startsWith("--");
  });
  
  const chunkSize = 200;
  const chunks = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    chunks.push(lines.slice(i, i + chunkSize).join("\n") + "\n");
  }
  
  console.log("\n📁 " + prefix + ": " + chunks.length + " chunks");
  for (let i = 0; i < chunks.length; i++) {
    const chunkPath = SQL_DIR + "/" + prefix + "-" + String(i).padStart(3, "0") + ".sql";
    writeFileSync(chunkPath, chunks[i]);
    process.stdout.write("   [" + (i + 1) + "/" + chunks.length + "] ... ");
    try {
      execSync(
        "cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --local --file=../../" + chunkPath,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 60000 }
      );
      console.log("✅");
    } catch (e) {
      console.log("❌ " + (e.stderr?.slice(0, 100) || "error"));
    }
  }
}

// First, truncate existing tecdoc data to avoid conflicts
console.log("🧹 Cleaning existing TecDoc data from D1...");
try {
  execSync(
    "cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --local --command=\"DELETE FROM ktype_registry WHERE source = 'tecdoc_1q2019'; DELETE FROM glass_rules WHERE notes = 'tecdoc_1q2019'; UPDATE glass_catalog SET ktype = NULL WHERE ktype IS NOT NULL;\"",
    { encoding: "utf-8", stdio: "pipe", timeout: 60000 }
  );
  console.log("   ✅ Cleaned");
} catch (e) {
  console.log("   ⚠️  Clean may have partial errors (OK)");
}

runFile("data/tecdoc-import/ktype-registry-inserts-v5.sql", "kr");
runFile("data/tecdoc-import/glass-rules-inserts-v5.sql", "gr");
runFile("data/tecdoc-import/glass-catalog-updates-v5.sql", "gc");

console.log("\n🎉 v5 import complete!");

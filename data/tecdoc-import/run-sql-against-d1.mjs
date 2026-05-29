import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { execSync } from "child_process";

const SQL_DIR = "data/tecdoc-import/d1-chunks";

function splitSqlFile(inputPath, prefix, chunkSize = 200) {
  const text = readFileSync(inputPath, "utf-8");
  const lines = text.split("\n").filter(l => {
    const trimmed = l.trim();
    return trimmed && !trimmed.startsWith("--") && !trimmed.toUpperCase().startsWith("BEGIN") && !trimmed.toUpperCase().startsWith("COMMIT");
  });
  
  const chunks = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    chunks.push(lines.slice(i, i + chunkSize).join("\n") + "\n");
  }
  
  // Write chunks
  for (let i = 0; i < chunks.length; i++) {
    const path = `${SQL_DIR}/${prefix}-${String(i).padStart(3, "0")}.sql`;
    writeFileSync(path, chunks[i]);
  }
  
  return chunks.length;
}

// Clean and create directory
import { mkdirSync, rmSync } from "fs";
try { rmSync(SQL_DIR, { recursive: true }); } catch {}
mkdirSync(SQL_DIR, { recursive: true });

const files = [
  { path: "data/tecdoc-import/ktype-registry-inserts.sql", prefix: "ktype-registry" },
  { path: "data/tecdoc-import/glass-rules-inserts.sql", prefix: "glass-rules" },
  { path: "data/tecdoc-import/glass-catalog-updates.sql", prefix: "glass-catalog" },
];

for (const { path, prefix } of files) {
  console.log(`\n📁 Splitting ${prefix}...`);
  const chunks = splitSqlFile(path, prefix, 200);
  console.log(`   → ${chunks} chunks`);
  
  for (let i = 0; i < chunks; i++) {
    const chunkPath = `${SQL_DIR}/${prefix}-${String(i).padStart(3, "0")}.sql`;
    console.log(`   [${i + 1}/${chunks}] Executing ${chunkPath}...`);
    try {
      const result = execSync(
        `cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --local --file=../../${chunkPath}`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 60000 }
      );
      if (result.includes("ERROR")) {
        console.error(`   ⚠️  Potential error in chunk ${i}`);
      } else {
        console.log(`   ✅ Chunk ${i + 1} done`);
      }
    } catch (e) {
      console.error(`   ❌ Chunk ${i + 1} failed: ${e.stderr?.slice(0, 200) || e.message}`);
    }
  }
}

console.log("\n🎉 All SQL executed!");

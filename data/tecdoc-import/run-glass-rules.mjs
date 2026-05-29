import { readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";

const SQL_DIR = "data/tecdoc-import/d1-chunks-gr";
try { rmSync(SQL_DIR, { recursive: true }); } catch {}
mkdirSync(SQL_DIR, { recursive: true });

const text = readFileSync("data/tecdoc-import/glass-rules-inserts-fixed.sql", "utf-8");
const lines = text.split("\n").filter(l => {
  const trimmed = l.trim();
  return trimmed && !trimmed.startsWith("--");
});

const chunkSize = 200;
const chunks = [];
for (let i = 0; i < lines.length; i += chunkSize) {
  chunks.push(lines.slice(i, i + chunkSize).join("\n") + "\n");
}

for (let i = 0; i < chunks.length; i++) {
  const path = `${SQL_DIR}/gr-${String(i).padStart(3, "0")}.sql`;
  writeFileSync(path, chunks[i]);
  console.log(`[${i + 1}/${chunks.length}] Executing ${path}...`);
  try {
    execSync(
      `cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --local --file=../../${path}`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 60000 }
    );
    console.log(`   ✅ Done`);
  } catch (e) {
    console.error(`   ❌ Failed: ${e.stderr?.slice(0, 300) || e.message}`);
  }
}

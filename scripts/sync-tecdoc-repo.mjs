#!/usr/bin/env node
/**
 * TecDoc Repo Selective Sync
 * ============================
 * Downloads only glass-relevant files from tecdocSQL/tecdocdatabase1Q2019.
 * Uses GitHub API for file listing + SHA-based incremental sync.
 *
 * Kjøring:
 *   node scripts/sync-tecdoc-repo.mjs            # core only (~10 MB)
 *   node scripts/sync-tecdoc-repo.mjs --all      # everything (~3 GB)
 *   node scripts/sync-tecdoc-repo.mjs --with-oe  # core + OEM numbers
 *   node scripts/sync-tecdoc-repo.mjs --force    # re-download all
 */

import * as fs from "fs";
import * as path from "path";

/* ── Config ────────────────────────────────────────────────── */
const REPO_OWNER = "tecdocSQL";
const REPO_NAME = "tecdocdatabase1Q2019";
const BRANCH = "main";
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;

const OUTPUT_DIR = path.join(process.cwd(), "data", "tecdoc-import");
const LAST_SYNC_FILE = path.join(OUTPUT_DIR, ".last-sync");

const FLAGS = {
  force: process.argv.includes("--force"),
  all: process.argv.includes("--all"),
  withOE: process.argv.includes("--with-oe"),
  withAttributes: process.argv.includes("--with-attributes"),
  withInfo: process.argv.includes("--with-info"),
  withMedia: process.argv.includes("--with-media"),
  withAccessories: process.argv.includes("--with-accessories"),
};

// Core files: small, essential (~10 MB total)
const CORE_PATTERNS = [
  "articles_linkages",
  "article_linkages",
  "passengercars",
  "commercialvehicles",
  "motorbikes",
  "manufacturers.csv",
  "models.csv",
];

// Optional heavy files
const OPTIONAL_PATTERNS = {
  withOE: ["article_new_numbers", "article_oe_numbers"],
  withAttributes: ["article_attributes"],
  withInfo: ["article_informations"],
  withMedia: ["article_mediainformation"],
  withAccessories: ["article_accessory_list"],
};

// Extra patterns only if --all
const EXTRA_PATTERNS = [
  "vehicle_types",
  "vehicle_type",
  "generic_articles",
  "des_texts",
];

const SKIP_PATTERNS = [".git", ".github", "README"];

/* ── Logger ────────────────────────────────────────────────── */
const G = "\x1b[32m";
const Y = "\x1b[33m";
const R = "\x1b[31m";
const RESET = "\x1b[0m";

function log(msg) { console.log(msg); }
function ok(msg) { console.log(`  ${G}✓${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${Y}⚠${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${R}✗${RESET} ${msg}`); }

/* ── Load/save sync state ──────────────────────────────────── */
function loadSyncState() {
  if (!fs.existsSync(LAST_SYNC_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(LAST_SYNC_FILE, "utf-8")); }
  catch { return {}; }
}

function saveSyncState(state) {
  fs.writeFileSync(LAST_SYNC_FILE, JSON.stringify(state, null, 2));
}

/* ── GitHub API helpers ────────────────────────────────────── */
async function githubApi(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "autoglass-tecdoc-sync/1.0",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buffer);
  return buffer.length;
}

/* ── Build wanted patterns based on flags ──────────────────── */
function buildWantedPatterns() {
  const patterns = [...CORE_PATTERNS];

  for (const [flag, ptrns] of Object.entries(OPTIONAL_PATTERNS)) {
    if (FLAGS[flag] || FLAGS.all) {
      patterns.push(...ptrns);
    }
  }

  if (FLAGS.all) {
    patterns.push(...EXTRA_PATTERNS);
  }

  return patterns;
}

function isWantedFile(name, wantedPatterns) {
  const lower = name.toLowerCase();
  for (const skip of SKIP_PATTERNS) {
    if (lower.includes(skip.toLowerCase())) return false;
  }
  for (const want of wantedPatterns) {
    if (lower.includes(want.toLowerCase())) return true;
  }
  return false;
}

/* ── Main ──────────────────────────────────────────────────── */
async function main() {
  log("\n☁️  TecDoc Repo Selective Sync");
  log("================================\n");

  const wantedPatterns = buildWantedPatterns();
  log(`   Mode: ${FLAGS.all ? "--all (everything)" : "selective"}`);
  log(`   Patterns: ${wantedPatterns.join(", ")}\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const syncState = loadSyncState();
  let downloaded = 0;
  let skipped = 0;
  let errors = 0;
  let totalBytes = 0;

  log("📂 Fetching file list from GitHub API...");
  let files;
  try {
    files = await githubApi(API_URL);
  } catch (e) {
    fail(e.message);
    process.exit(1);
  }

  const wantedFiles = files.filter((f) => f.type === "file" && isWantedFile(f.name, wantedPatterns));
  log(`   ${files.length} total files → ${wantedFiles.length} selected\n`);

  for (const file of wantedFiles) {
    const destPath = path.join(OUTPUT_DIR, file.name);
    const existingSha = syncState[file.name];

    if (!FLAGS.force && existingSha === file.sha && fs.existsSync(destPath)) {
      skipped++;
      continue;
    }

    process.stdout.write(`   Downloading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)... `);

    try {
      const bytes = await downloadFile(file.download_url, destPath);
      syncState[file.name] = file.sha;
      downloaded++;
      totalBytes += bytes;
      console.log(`${G}✓${RESET}`);
    } catch (e) {
      errors++;
      console.log(`${R}✗${RESET} ${e.message}`);
    }
  }

  saveSyncState(syncState);

  log(`\n📊 Summary:`);
  log(`   Downloaded: ${downloaded} files (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
  log(`   Skipped (unchanged): ${skipped} files`);
  if (errors > 0) log(`   ${R}Errors: ${errors}${RESET}`);
  log(`   Output: ${OUTPUT_DIR}`);
  log(`\n${G}✅ Sync complete.${RESET}\n`);
}

main().catch((e) => {
  console.error(`\n${R}❌ Sync failed:${RESET}`, e.message);
  process.exit(1);
});

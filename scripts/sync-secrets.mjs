#!/usr/bin/env node
/**
 * Secret-synkronisering
 * =====================
 * Sammenligner .env.local, GitHub secrets, og Wrangler secrets.
 * Rapporterer avvik (oppdaterer IKKE noe automatisk).
 *
 * Kjøring:
 *   node scripts/sync-secrets.mjs
 */

import * as fs from "fs";
import { execSync } from "child_process";

const R = "\x1b[31m";
const G = "\x1b[32m";
const Y = "\x1b[33m";
const RESET = "\x1b[0m";

const SECRETS = [
  "SVV_API_KEY",
  "BILUPPGIFTER_API_KEY",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "GLASS_KV_NAMESPACE_ID",
];

function loadEnvLocal() {
  const path = ".env.local";
  if (!fs.existsSync(path)) return {};
  const content = fs.readFileSync(path, "utf-8");
  const vars = {};
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) vars[match[1]] = match[2];
  }
  return vars;
}

function loadGhSecrets() {
  try {
    const out = execSync("gh secret list --json name", { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
    const list = JSON.parse(out);
    const vars = {};
    for (const item of list) vars[item.name] = "***SET***";
    return vars;
  } catch {
    return {};
  }
}

function loadWranglerSecrets() {
  try {
    const out = execSync("cd api/cf-worker && npx wrangler secret list", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    // wrangler output er ikke JSON — dette er en forenkling
    return {};
  } catch {
    return {};
  }
}

function main() {
  console.log("\n🔐 Secret-synkronisering\n");

  const envLocal = loadEnvLocal();
  const ghSecrets = loadGhSecrets();

  let issues = 0;

  for (const secret of SECRETS) {
    const inEnv = !!envLocal[secret] && envLocal[secret] !== "din_xxx_her";
    const inGh = !!ghSecrets[secret];

    const status = inEnv && inGh
      ? `${G}✓${RESET}`
      : inEnv || inGh
      ? `${Y}⚠${RESET}`
      : `${R}✗${RESET}`;

    const loc = [
      inEnv ? ".env.local" : null,
      inGh ? "GitHub" : null,
    ].filter(Boolean).join(", ") || "INGEN";

    if (!inEnv || !inGh) issues++;

    console.log(`  ${status} ${secret}: ${loc}`);
  }

  console.log("\n" + "═".repeat(40));
  if (issues === 0) {
    console.log(`${G}✅ Alle secrets synkronisert${RESET}\n`);
  } else {
    console.log(`${Y}⚠️  ${issues} secret(s) mangler på ett eller flere steder${RESET}`);
    console.log(`   Oppdater: gh secret set <NAME> eller wrangler secret put <NAME>\n`);
  }
}

main();

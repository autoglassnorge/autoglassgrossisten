#!/usr/bin/env node
/**
 * GitHub MCP wrapper — laster GH_PAT fra .env.local
 * Autoglass AS — selvstendig, ingen avhengighet til Klarpakke
 */
import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { loadEnvLocal } from "./load-env.mjs";
import { gracefulExit } from "./mcp-graceful-exit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");

const env = loadEnvLocal();

if (!env.GH_PAT && !env.GITHUB_TOKEN) {
  gracefulExit(["GH_PAT", "GITHUB_TOKEN"], "run-github-mcp");
}

if (!env.GITHUB_TOKEN && env.GH_PAT) {
  env.GITHUB_TOKEN = env.GH_PAT;
}

const child = spawn(
  "npx",
  ["-y", "@modelcontextprotocol/server-github"],
  { env, stdio: "inherit", cwd: root }
);

child.on("exit", (code) => process.exit(code ?? 0));

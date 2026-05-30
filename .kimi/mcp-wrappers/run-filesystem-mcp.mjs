#!/usr/bin/env node
/**
 * Filesystem MCP wrapper — gir tilgang til prosjektrot
 * Autoglass AS — selvstendig, ingen avhengighet til Klarpakke
 */
import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { loadEnvLocal } from "./load-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");

const env = loadEnvLocal();

const child = spawn(
  "npx",
  ["-y", "@modelcontextprotocol/server-filesystem@2026.1.14", root],
  { env, stdio: "inherit", cwd: root }
);

child.on("exit", (code) => process.exit(code ?? 0));

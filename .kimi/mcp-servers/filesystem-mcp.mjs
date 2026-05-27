#!/usr/bin/env node
/**
 * Filesystem MCP wrapper — Autoglass AS Edition
 * Gir tilgang til /Users/taj/bilglass (IKKE klarpakke)
 */
import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../.."); // /Users/taj/bilglass

const child = spawn(
  "npx",
  ["-y", "@modelcontextprotocol/server-filesystem@2026.1.14", root],
  { stdio: "inherit", cwd: root }
);

child.on("exit", (code) => process.exit(code ?? 0));

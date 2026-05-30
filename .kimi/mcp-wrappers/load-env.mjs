#!/usr/bin/env node
/**
 * Universal env loader — laster ALLE variabler fra .env.local
 * Autoglass AS — selvstendig, ingen avhengighet til Klarpakke
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Finner prosjektrot (2 nivåer opp fra .kimi/mcp-wrappers/)
const root = resolve(__dirname, "../..");

export function loadEnvLocal() {
  const env = { ...process.env };
  
  const envPaths = [
    resolve(root, ".env.local"),
  ];
  
  let loadedTotal = 0;
  
  for (const envPath of envPaths) {
    if (!existsSync(envPath)) continue;

    try {
      const content = readFileSync(envPath, "utf8");
      let loaded = 0;
      const fileName = envPath.split('/').pop();
      
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const eq = trimmed.indexOf("=");
          if (eq > 0) {
            const key = trimmed.slice(0, eq).trim();
            let value = trimmed.slice(eq + 1).trim();
            
            if (value.startsWith('"') && value.endsWith('"')) {
              value = value.slice(1, -1).replace(/\\"/g, '"');
            } else if (value.startsWith("'") && value.endsWith("'")) {
              value = value.slice(1, -1).replace(/\\'/g, "'");
            }
            value = value.trim();
            
            if (env[key] === undefined || env[key] === "") {
              env[key] = value;
              loaded++;
            }
          }
        }
      }
      
      console.error(`[load-env] Lastet ${loaded} variabler fra ${fileName}`);
      loadedTotal += loaded;
    } catch (e) {
      console.error(`[load-env] Feil ved lesing av ${envPath}:`, e.message);
    }
  }
  
  console.error(`[load-env] Totalt lastet: ${loadedTotal} variabler`);
  return env;
}

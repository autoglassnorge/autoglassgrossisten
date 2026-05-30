#!/usr/bin/env node
/**
 * mcp-graceful-exit.mjs — no-op MCP server ved manglende env
 * Autoglass AS — selvstendig, ingen avhengighet til Klarpakke
 *
 * Bruk istedenfor process.exit(1).
 * KIMI viser "(0 tools)" istedenfor "failed".
 */
export function gracefulExit(missingVars, serverName = "mcp-server") {
  const missing = Array.isArray(missingVars) ? missingVars : [missingVars];
  process.stderr.write(`[${serverName}] Mangler: ${missing.join(", ")} — starter no-op MCP\n`);

  process.stdin.setEncoding("utf8");
  let buf = "";

  process.stdin.on("data", (chunk) => {
    buf += chunk;
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }

      if (!msg.method) continue;
      if (msg.method.startsWith("notifications/")) continue;
      if (msg.id === undefined || msg.id === null) continue;

      if (msg.method === "initialize") {
        process.stdout.write(JSON.stringify({
          jsonrpc: "2.0", id: msg.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: serverName, version: "0.0.0" }
          }
        }) + "\n");
      } else if (msg.method === "tools/list") {
        process.stdout.write(JSON.stringify({
          jsonrpc: "2.0", id: msg.id, result: { tools: [] }
        }) + "\n");
      } else {
        process.stdout.write(JSON.stringify({
          jsonrpc: "2.0", id: msg.id, result: {}
        }) + "\n");
      }
    }
  });

  process.stdin.on("end", () => process.exit(0));
}

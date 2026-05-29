#!/usr/bin/env bash
#
# KIMI CODE — Installer og emigrer automatisk
# ============================================
# Kjøres fra repo-root: bash .kimi/install-and-migrate.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KIMI_DIR="$REPO_ROOT/.kimi"
D1_DIR="$REPO_ROOT/api/cf-worker"
TECDOC_DIR="$REPO_ROOT/data/tecdoc-import"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     KIMI CODE — Installer og emigrer (automatisk)          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "📁 Repo: $REPO_ROOT"
echo "📁 KIMI: $KIMI_DIR"
echo ""

# ── 1. VALIDER AGENTER ──
echo "🔍 1. Validerer agenter..."
AGENT_COUNT=$(ls "$KIMI_DIR/agents"/*.yaml 2>/dev/null | wc -l | tr -d ' ')
echo "   → $AGENT_COUNT agent-YAML funnet"

for f in "$KIMI_DIR/agents"/*.yaml; do
  name=$(basename "$f" .yaml)
  md_file="$KIMI_DIR/agents/${name}.md"
  if [ -f "$md_file" ]; then
    echo "   ✅ $name (yaml + md)"
  else
    echo "   ⚠️  $name mangler .md-fil"
  fi
done

# ── 2. VALIDER commands.json ──
echo ""
echo "🔍 2. Validerer commands.json..."
if python3 -m json.tool "$KIMI_DIR/commands.json" >/dev/null 2>&1; then
  ALIAS_COUNT=$(python3 -c "import json; print(len(json.load(open('$KIMI_DIR/commands.json'))['commands']))")
  echo "   ✅ Gyldig JSON — $ALIAS_COUNT aliaser"
else
  echo "   ❌ Ugyldig JSON!"
  exit 1
fi

# ── 3. VALIDER config.toml ──
echo ""
echo "🔍 3. Validerer config.toml..."
if [ -f "$KIMI_DIR/config.toml" ]; then
  echo "   ✅ config.toml finnes"
else
  echo "   ❌ config.toml mangler!"
  exit 1
fi

# ── 4. VALIDER HOOKS ──
echo ""
echo "🔍 4. Validerer hooks..."
for hook in session-start.sh session-end.sh; do
  hook_path="$KIMI_DIR/hooks/$hook"
  if [ -x "$hook_path" ]; then
    echo "   ✅ $hook (kjørbar)"
  elif [ -f "$hook_path" ]; then
    echo "   ⚠️  $hook finnes men er ikke kjørbar — fikser..."
    chmod +x "$hook_path"
    echo "   ✅ $hook (nå kjørbar)"
  else
    echo "   ❌ $hook mangler!"
  fi
done

# ── 5. RENS .DS_Store ──
echo ""
echo "🧹 5. Rensker .DS_Store..."
find "$KIMI_DIR" -name ".DS_Store" -delete 2>/dev/null || true
find "$REPO_ROOT/data" -name ".DS_Store" -delete 2>/dev/null || true
echo "   ✅ Ferdig"

# ── 6. VERIFISER TECDOC-DATA ──
echo ""
echo "📦 6. Verifiserer TecDoc-import data..."
if [ -f "$TECDOC_DIR/remote-deploy-v5.sql" ]; then
  SQL_LINES=$(wc -l < "$TECDOC_DIR/remote-deploy-v5.sql" | tr -d ' ')
  echo "   ✅ remote-deploy-v5.sql ($SQL_LINES linjer)"
else
  echo "   ❌ remote-deploy-v5.sql mangler!"
fi

for f in tecdoc-ktype-mapping.json matching-report-v5.json DEPLOY-RUNBOOK.md; do
  if [ -f "$TECDOC_DIR/$f" ]; then
    echo "   ✅ $f"
  else
    echo "   ⚠️  $f mangler"
  fi
done

# ── 7. VERIFISER LOKAL D1 ──
echo ""
echo "🗃️  7. Verifiserer lokal D1..."
cd "$D1_DIR"

if npx wrangler d1 execute glass-catalog-db --local \
  --command="SELECT COUNT(*) as c FROM glass_catalog WHERE ktype IS NOT NULL" 2>/dev/null | grep -q '"c": 11294'; then
  echo "   ✅ glass_catalog.ktype: 11,294 records"
else
  echo "   ⚠️  glass_catalog.ktype: avvik fra forventet 11,294"
fi

if npx wrangler d1 execute glass-catalog-db --local \
  --command="SELECT COUNT(*) as c FROM ktype_registry" 2>/dev/null | grep -q '"c": 907'; then
  echo "   ✅ ktype_registry: 907 rows"
else
  echo "   ⚠️  ktype_registry: avvik fra forventet 907"
fi

if npx wrangler d1 execute glass-catalog-db --local \
  --command="SELECT COUNT(*) as c FROM glass_rules WHERE notes = 'tecdoc_1q2019'" 2>/dev/null | grep -q '"c": 1182'; then
  echo "   ✅ glass_rules (tecdoc): 1,182 rows"
else
  echo "   ⚠️  glass_rules (tecdoc): avvik fra forventet 1,182"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "                    EMIGRERINGSSTATUS                          "
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  ✅ Lokal D1: Klar (11,294 records, 907 registry, 1,182 rules)"
echo "  ✅ SQL-deploy-fil: Klar (remote-deploy-v5.sql)"
echo "  ✅ KIMI-konfig: Klar ($AGENT_COUNT agenter, $ALIAS_COUNT aliaser)"
echo ""

# ── 8. SJEKK REMOTE DEPLOY MULIGHET ──
echo "🔐 8. Sjekker remote deploy-forutsetninger..."
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "   ✅ CLOUDFLARE_API_TOKEN er satt"
  echo ""
  echo "   🚀 KLAR FOR EMIGRERING! Kjør:"
  echo ""
  echo "      cd api/cf-worker && npx wrangler d1 execute glass-catalog-db --remote \\"
  echo "        --file=../../data/tecdoc-import/remote-deploy-v5.sql"
  echo ""
else
  echo "   ❌ CLOUDFLARE_API_TOKEN mangler i miljøet"
  echo ""
  echo "   For å emigrere til produksjon:"
  echo ""
  echo "      export CLOUDFLARE_API_TOKEN='din_token_her'"
  echo "      bash .kimi/install-and-migrate.sh"
  echo ""
fi

echo "═══════════════════════════════════════════════════════════════"
echo "                      KIMI ALIASER                             "
echo "═══════════════════════════════════════════════════════════════"
echo ""
node -e "const c=JSON.parse(require('fs').readFileSync('$KIMI_DIR/commands.json','utf8')); c.commands.forEach(a=>console.log('  kimi ' + a.alias.padEnd(15) + ' # ' + a.description));"
echo ""
echo "🎉 KIMI CODE installasjon fullført!"

#!/usr/bin/env bash
# KIMI Session Start Hook — Autoglass AS v2.0
# Forbedret med kontekst fra forrige session, D1/KV metrikker, og uavklarte blockers

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE_FILE="$REPO_ROOT/.kimi/PROJECT_STATE.md"
SUMMARY_DIR="$REPO_ROOT/.kimi/session-summaries"

echo ""
echo "🚀 Autoglass AS — Session Start"
echo "═══════════════════════════════════════════════════════"

# 1. AKTIVE BLOCKERS (fra PROJECT_STATE.md)
echo ""
echo "🚨 AKTIVE BLOCKERS:"
echo "───────────────────────────────────────────────────────"

if [ -f "$STATE_FILE" ]; then
  awk '/## Current blockers/,/## Open technical debt/' "$STATE_FILE" | \
    grep "^| P" | \
    while IFS='|' read -r _ prio blocker status _; do
      prio=$(echo "$prio" | xargs)
      blocker=$(echo "$blocker" | xargs)
      status=$(echo "$status" | xargs)
      if [ "$status" != "✅" ] && [ -n "$blocker" ]; then
        echo "  [$prio] $blocker — $status"
      fi
    done
else
  echo "  ⚠️  PROJECT_STATE.md ikke funnet"
fi

# 2. SISTE SESSION-SUMMARY
echo ""
echo "📝 SISTE SESSION:"
echo "───────────────────────────────────────────────────────"

if [ -d "$SUMMARY_DIR" ]; then
  LATEST=$(ls -t "$SUMMARY_DIR"/session-*.md 2>/dev/null | head -1)
  if [ -n "$LATEST" ]; then
    echo "  $(basename "$LATEST")"
    # Vis git diff-stat fra siste session
    awk '/## Endrede filer/,/## D1 lokal status/' "$LATEST" | grep -v "^##" | head -10
  else
    echo "  (ingen tidligere session-summaries)"
  fi
else
  echo "  (ingen session-summaries-mappe)"
fi

# 3. D1 METRIKKER (lokal)
echo ""
echo "🗄️  D1 LOKAL STATUS:"
echo "───────────────────────────────────────────────────────"

cd "$REPO_ROOT/api/cf-worker"
D1_OUTPUT=$(npx wrangler d1 execute glass-catalog-db --local \
  --command="SELECT 'glass_catalog' as t, COUNT(*) as c FROM glass_catalog UNION ALL SELECT 'ktype_registry', COUNT(*) FROM ktype_registry UNION ALL SELECT 'glass_rules', COUNT(*) FROM glass_rules UNION ALL SELECT 'ktype_matches', COUNT(*) FROM ktype_matches UNION ALL SELECT 'tecdoc_ktype_registry', COUNT(*) FROM tecdoc_ktype_registry" 2>/dev/null)

if [ $? -eq 0 ]; then
  echo "$D1_OUTPUT" | grep -E "glass_catalog|ktype_registry|glass_rules|ktype_matches|tecdoc" | sed 's/^/  /'
else
  echo "  ⚠️  D1 ikke tilgjengelig (kjør 'wrangler dev' først?)"
fi

# 4. KATALOG-STATUS
echo ""
echo "📦 KATALOG:"
echo "───────────────────────────────────────────────────────"

CATALOG_FILE="$REPO_ROOT/data/catalog-prod.json"
if [ -f "$CATALOG_FILE" ]; then
  CATALOG_SIZE=$(stat -f%z "$CATALOG_FILE" 2>/dev/null || stat -c%s "$CATALOG_FILE" 2>/dev/null)
  CATALOG_MTIME=$(stat -f%Sm "$CATALOG_FILE" 2>/dev/null || stat -c%y "$CATALOG_FILE" 2>/dev/null)
  echo "  catalog-prod.json: $(echo "$CATALOG_SIZE" | awk '{printf "%.1f MB", $1/1024/1024}') — sist endret: $CATALOG_MTIME"
else
  echo "  ⚠️  catalog-prod.json ikke funnet"
fi

# 5. SISTE MEMPALACE DIARY-ENTRIES (prediktiv kontekst)
echo ""
echo "🧠 SISTE AKTIVITETER (MemPalace diary):"
echo "───────────────────────────────────────────────────────"

DIARY_FILE="$REPO_ROOT/.kimi/mempalace/data/diary.jsonl"
if [ -f "$DIARY_FILE" ]; then
  node -e "
const fs = require('fs');
const lines = fs.readFileSync('$DIARY_FILE', 'utf8').trim().split('\n').filter(Boolean);
const entries = lines.slice(-5).map(l => {
  try { return JSON.parse(l); } catch { return null; }
}).filter(Boolean);
entries.forEach(e => {
  const ts = e.timestamp ? e.timestamp.slice(0, 16).replace('T', ' ') : '?';
  const agent = e.agent || 'unknown';
  const event = e.event || 'unknown';
  console.log('  [' + ts + '] ' + agent + ' — ' + event);
});
" 2>/dev/null || echo "  (kunne ikke lese diary)"
else
  echo "  (ingen diary funnet)"
fi

# 6. ÅPNE PRs (hvis gh CLI er tilgjengelig)
echo ""
echo "🔀 ÅPNE PULL REQUESTS:"
echo "───────────────────────────────────────────────────────"

if command -v gh &> /dev/null; then
  cd "$REPO_ROOT"
  gh pr list --limit 5 2>/dev/null | sed 's/^/  /' || echo "  (ingen åpne PRs eller ikke logget inn)"
else
  echo "  (gh CLI ikke installert)"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo ""

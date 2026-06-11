#!/usr/bin/env bash
# KIMI Session Start Hook — Autoglass AS v2.1 (Token-optimalisert)
# v2.1: Cacher blockers i JSON for raskere oppstart, komprimert output

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE_FILE="$REPO_ROOT/.kimi/PROJECT_STATE.md"
BLOCKER_CACHE="$REPO_ROOT/.kimi/blocker-cache.json"
SUMMARY_DIR="$REPO_ROOT/.kimi/session-summaries"

echo ""
echo "🚀 Autoglass AS — Session Start"
echo "═══════════════════════════════════════════════════════"

# 1. AKTIVE BLOCKERS (cached JSON for rask parsing)
echo ""
echo "🚨 AKTIVE BLOCKERS:"

# Rebuild cache hvis PROJECT_STATE.md er nyere enn cache
if [ ! -f "$BLOCKER_CACHE" ] || [ "$STATE_FILE" -nt "$BLOCKER_CACHE" ]; then
  if [ -f "$STATE_FILE" ]; then
    node -e "
const fs = require('fs');
const content = fs.readFileSync('$STATE_FILE', 'utf8');
const blockers = [];
const match = content.match(/## Current blockers([\s\S]*?)## Open technical debt/);
if (match) {
  const lines = match[1].split('\n').filter(l => l.startsWith('| P'));
  for (const line of lines) {
    const parts = line.split('|').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 3 && parts[2] !== '✅') {
      blockers.push({ prio: parts[0], blocker: parts[1], status: parts[2] });
    }
  }
}
fs.writeFileSync('$BLOCKER_CACHE', JSON.stringify(blockers));
" 2>/dev/null
  fi
fi

if [ -f "$BLOCKER_CACHE" ]; then
  node -e "
const fs = require('fs');
const blockers = JSON.parse(fs.readFileSync('$BLOCKER_CACHE', 'utf8'));
if (blockers.length === 0) {
  console.log('  ✅ Ingen aktive blockers');
} else {
  blockers.forEach(b => {
    console.log('  [' + b.prio + '] ' + b.blocker.slice(0, 70) + ' — ' + b.status);
  });
}
" 2>/dev/null || echo "  (kunne ikke lese blocker-cache)"
else
  echo "  ⚠️  PROJECT_STATE.md ikke funnet"
fi

# 2. SISTE SESSION (kun filnavn, ikke hele diff)
echo ""
echo "📝 SISTE SESSION:"
if [ -d "$SUMMARY_DIR" ]; then
  LATEST=$(ls -t "$SUMMARY_DIR"/session-*.md 2>/dev/null | head -1)
  if [ -n "$LATEST" ]; then
    echo "  $(basename "$LATEST")"
  else
    echo "  (ingen tidligere session-summaries)"
  fi
else
  echo "  (ingen session-summaries-mappe)"
fi

# 3. KOMPAKT STATUS (D1 + Katalog + Diary + PRs på én linje hver)
echo ""
echo "📊 STATUS:"

# D1 (kun hvis wrangler dev kjører)
D1_FILE="$REPO_ROOT/api/cf-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"
if [ -d "$D1_FILE" ]; then
  echo "  🗄️  D1: tilgjengelig (lokal)"
else
  echo "  🗄️  D1: ikke tilgjengelig (kjør 'wrangler dev')"
fi

# Katalog
CATALOG_FILE="$REPO_ROOT/data/catalog-prod.json"
if [ -f "$CATALOG_FILE" ]; then
  CATALOG_SIZE=$(stat -f%z "$CATALOG_FILE" 2>/dev/null || stat -c%s "$CATALOG_FILE" 2>/dev/null)
  echo "  📦 Katalog: $(echo "$CATALOG_SIZE" | awk '{printf "%.1f MB", $1/1024/1024}')"
else
  echo "  📦 Katalog: ikke funnet"
fi

# Siste diary (kun siste entry)
DIARY_FILE="$REPO_ROOT/.kimi/mempalace/data/diary.jsonl"
if [ -f "$DIARY_FILE" ]; then
  LAST_ENTRY=$(tail -1 "$DIARY_FILE" 2>/dev/null)
  if [ -n "$LAST_ENTRY" ]; then
    TASK=$(echo "$LAST_ENTRY" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log((d.task||'?').slice(0,50))" 2>/dev/null)
    STATUS=$(echo "$LAST_ENTRY" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.status||'?')" 2>/dev/null)
    echo "  🧠 Siste: $TASK — $STATUS"
  fi
fi

# PRs (kun antall)
if command -v gh &> /dev/null; then
  PR_COUNT=$(cd "$REPO_ROOT" && gh pr list --limit 20 2>/dev/null | wc -l | tr -d ' ')
  if [ "$PR_COUNT" -gt 0 ]; then
    echo "  🔀 PRs: $PR_COUNT åpne"
  else
    echo "  🔀 PRs: ingen åpne"
  fi
else
  echo "  🔀 PRs: gh CLI ikke installert"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo ""

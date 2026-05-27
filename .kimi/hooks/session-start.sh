#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# 🤖 SESSION START — Autoglass AS v2.0
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

PROJECT_DIR="/Users/taj/bilglass"
cd "$PROJECT_DIR" || exit 0

echo ""
echo "🏭 [Autoglass Session Start]"

# ─── 1. SISTE SESSION-KONTEKST ───
LATEST="$PROJECT_DIR/.kimi/session-summaries/latest.md"
if [ -f "$LATEST" ] && [ -s "$LATEST" ]; then
  AGE_HOURS=$(( ($(date +%s) - $(stat -f %m "$LATEST" 2>/dev/null || stat -c %Y "$LATEST")) / 3600 ))
  if [ "$AGE_HOURS" -lt 24 ]; then
    echo ""
    echo "📋 Siste session (<24t):"
    head -6 "$LATEST" | sed 's/^/   /'
  fi
fi

# ─── 2. ÅPNE BLOKKERE ───
if [ -f ".kimi/PROJECT_STATE.md" ]; then
  BLOCKERS=$(grep -A 20 "Current blockers" .kimi/PROJECT_STATE.md | grep "^| P" | grep -v "✅" | head -3 || true)
  if [ -n "$BLOCKERS" ]; then
    echo ""
    echo "🚨 ÅPNE BLOKKERE:"
    echo "$BLOCKERS" | while read -r line; do echo "   $line"; done
  fi
fi

# ─── 3. GIT-STATUS ───
if git rev-parse --git-dir >/dev/null 2>&1; then
  BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
  UNCOMMITTED=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
  echo ""
  echo "   📁 Branch: $BRANCH"
  echo "   📝 Uncommitted: $UNCOMMITTED"
fi

echo ""
exit 0

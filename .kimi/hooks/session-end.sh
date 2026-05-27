#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# 🤖 MEMPALACE SMART EXIT — Autoglass AS v2.0
# SessionEnd-hook som lagrer kontekst for neste session:
#   1. Git-diff-stat (hva ble endret)
#   2. Siste commit-meldinger (kontekst)
#   3. Kompakt session-summary til .kimi/session-summaries/
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

PROJECT_DIR="/Users/taj/bilglass"
SUMMARY_DIR="$PROJECT_DIR/.kimi/session-summaries"
mkdir -p "$SUMMARY_DIR"

cd "$PROJECT_DIR" || exit 0

# ─── 1. GIT ANALYSE ───
FILE_COUNT=0
LINE_COUNT=0
CHANGED_FILES=""
DIFF_STAT=""
LATEST_COMMITS=""

if git rev-parse --git-dir >/dev/null 2>&1; then
  CHANGED_FILES="$(git diff --name-only 2>/dev/null | tr '\n' ' ' || true)"
  FILE_COUNT="$(git diff --name-only 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
  LINE_COUNT="$(git diff --numstat 2>/dev/null | awk '{sum+=$1+$2} END {print sum+0}' || echo 0)"
  DIFF_STAT="$(git diff --stat 2>/dev/null | tail -1 || true)"
  LATEST_COMMITS="$(git log --oneline -3 2>/dev/null || true)"
fi

# ─── 2. SESSION-SUMMARY (kun hvis endringer) ───
if [ "$FILE_COUNT" -gt 0 ]; then
  TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
  SUMMARY_FILE="$SUMMARY_DIR/session-$TIMESTAMP.md"

  cat > "$SUMMARY_FILE" <<EOF
# Session Summary — $TIMESTAMP

**Endringer:** $FILE_COUNT filer, $LINE_COUNT linjer
**Diff:** $DIFF_STAT

## Filer
$CHANGED_FILES

## Siste commits
$LATEST_COMMITS
EOF

  # Oppdater "latest" symlink
  ln -sf "$SUMMARY_FILE" "$SUMMARY_DIR/latest.md"

  echo ""
  echo "🤖 [Smart Exit v2.0] $FILE_COUNT filer ($LINE_COUNT linjer) endret."
  echo "   📄 $SUMMARY_FILE"
  echo ""
fi

exit 0

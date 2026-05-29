#!/usr/bin/env bash
# KIMI Session End Hook — Autoglass AS
# Git diff + session summary

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

SUMMARY_DIR="$REPO_ROOT/.kimi/session-summaries"
mkdir -p "$SUMMARY_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SUMMARY_FILE="$SUMMARY_DIR/session-$TIMESTAMP.md"

echo ""
echo "📝 Genererer session-summary..."

# Git status
echo "# Session Summary — $TIMESTAMP" > "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"
echo "## Git Status" >> "$SUMMARY_FILE"
echo "\`\`\`" >> "$SUMMARY_FILE"
git status --short >> "$SUMMARY_FILE" 2>/dev/null || echo "(ikke et git-repo)" >> "$SUMMARY_FILE"
echo "\`\`\`" >> "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"

# Changed files
echo "## Endrede filer" >> "$SUMMARY_FILE"
git diff --stat >> "$SUMMARY_FILE" 2>/dev/null || echo "(ingen endringer)" >> "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"

# D1 status (lokal)
echo "## D1 lokal status" >> "$SUMMARY_FILE"
cd "$REPO_ROOT/api/cf-worker"
npx wrangler d1 execute glass-catalog-db --local \
  --command="SELECT 'glass_catalog' as t, COUNT(*) as c FROM glass_catalog UNION ALL SELECT 'ktype_registry', COUNT(*) FROM ktype_registry UNION ALL SELECT 'glass_rules', COUNT(*) FROM glass_rules UNION ALL SELECT 'ktype_matches', COUNT(*) FROM ktype_matches" \
  >> "$SUMMARY_FILE" 2>/dev/null || echo "(D1 ikke tilgjengelig)" >> "$SUMMARY_FILE"

echo "" >> "$SUMMARY_FILE"
echo "---" >> "$SUMMARY_FILE"
echo "Generert: $(date -Iseconds)" >> "$SUMMARY_FILE"

echo "   ✅ Lagret til: $SUMMARY_FILE"
echo ""

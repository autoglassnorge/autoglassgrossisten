#!/usr/bin/env bash
# KIMI Session End Hook — Autoglass AS v2.0
# Auto-verifikasjon, diary, og blocker-oppdatering

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

SUMMARY_DIR="$REPO_ROOT/.kimi/session-summaries"
mkdir -p "$SUMMARY_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SUMMARY_FILE="$SUMMARY_DIR/session-$TIMESTAMP.md"

DID_SMOKE_TEST=false
DID_VALIDATE=false
SMOKE_RESULT="SKIP"
VALIDATE_RESULT="SKIP"

echo ""
echo "📝 Genererer session-summary og auto-verifikasjon..."

# ── 1. Git status ─────────────────────────────────────────────
{
echo "# Session Summary — $TIMESTAMP"
echo ""
echo "## Git Status"
echo "\`\`\`"
git status --short 2>/dev/null || echo "(ikke et git-repo)"
echo "\`\`\`"
echo ""

# Changed files
echo "## Endrede filer"
git diff --stat 2>/dev/null || echo "(ingen endringer)"
echo ""

# Hvilke filer ble endret?
CHANGED_FILES=$(git diff --name-only 2>/dev/null || true)

# ── 2. Auto-verifikasjon ──────────────────────────────────────
echo "## Auto-verifikasjon"
echo ""

# Sjekk om Worker-filer ble endret
if echo "$CHANGED_FILES" | grep -qE "api/cf-worker/|scripts/smoke-test"; then
  echo "🔍 Worker-filer endret — kjører smoke-test..."
  echo "\`\`\`"
  if node scripts/smoke-test.mjs 2>&1; then
    SMOKE_RESULT="PASS"
    echo "\`\`\`"
    echo ""
    echo "✅ Smoke-test: PASS"
  else
    SMOKE_RESULT="FAIL"
    echo "\`\`\`"
    echo ""
    echo "❌ Smoke-test: FAIL"
  fi
  DID_SMOKE_TEST=true
  echo ""
else
  echo "ℹ️  Ingen Worker-endringer — hopper over smoke-test"
fi

# Sjekk om data-filer ble endret
if echo "$CHANGED_FILES" | grep -qE "data/|scripts/validate-catalog"; then
  echo "🔍 Data-filer endret — kjører kvalitets-gate..."
  echo "\`\`\`"
  if node scripts/validate-catalog.mjs 2>&1; then
    VALIDATE_RESULT="PASS"
    echo "\`\`\`"
    echo ""
    echo "✅ Kvalitets-gate: PASS"
  else
    VALIDATE_RESULT="BLOCK"
    echo "\`\`\`"
    echo ""
    echo "❌ Kvalitets-gate: BLOCK"
  fi
  DID_VALIDATE=true
  echo ""
else
  echo "ℹ️  Ingen data-endringer — hopper over kvalitets-gate"
fi

# ── 3. D1 status ──────────────────────────────────────────────
echo ""
echo "## D1 lokal status"
cd "$REPO_ROOT/api/cf-worker"
npx wrangler d1 execute glass-catalog-db --local \
  --command="SELECT 'glass_catalog' as t, COUNT(*) as c FROM glass_catalog UNION ALL SELECT 'ktype_registry', COUNT(*) FROM ktype_registry UNION ALL SELECT 'glass_rules', COUNT(*) FROM glass_rules UNION ALL SELECT 'ktype_matches', COUNT(*) FROM ktype_matches" \
  2>/dev/null || echo "(D1 ikke tilgjengelig)"

echo ""
echo "---"
echo "Auto-verifikasjon: smoke=$SMOKE_RESULT, validate=$VALIDATE_RESULT"
echo "Generert: $(date -Iseconds)"
} > "$SUMMARY_FILE"

# ── 4. Auto-diary via MemPalace (direkte til diary.jsonl) ─────
echo ""
echo "📝 Skriver til MemPalace diary..."

# Tell endrede filer
FILE_COUNT=$(echo "$CHANGED_FILES" | grep -c '.' || echo "0")

# Bestem oppgavetype
TASK_TYPE="AUTO"
if echo "$CHANGED_FILES" | grep -qE "api/cf-worker/"; then TASK_TYPE="FEAT"; fi
if echo "$CHANGED_FILES" | grep -qE "api/scrapers/|data/"; then TASK_TYPE="FEAT"; fi
if echo "$CHANGED_FILES" | grep -qE "scripts/"; then TASK_TYPE="OPT"; fi
if echo "$CHANGED_FILES" | grep -qE "\.html$|css/|js/"; then TASK_TYPE="FEAT"; fi
if [ "$SMOKE_RESULT" = "FAIL" ] || [ "$VALIDATE_RESULT" = "BLOCK" ]; then TASK_TYPE="FIX"; fi

# Bestem status
DIARY_STATUS="GO"
if [ "$SMOKE_RESULT" = "FAIL" ] || [ "$VALIDATE_RESULT" = "BLOCK" ]; then DIARY_STATUS="NO-GO"; fi

# Skriv direkte til diary.jsonl
DIARY_FILE="$REPO_ROOT/.kimi/mempalace/data/diary.jsonl"
mkdir -p "$(dirname "$DIARY_FILE")"

node -e "
const fs = require('fs');
const entry = {
  timestamp: new Date().toISOString(),
  agent: 'autoglass-orchestrator',
  event: 'session_end_${TIMESTAMP}',
  summary: 'Session ${TIMESTAMP} — ${FILE_COUNT} filer endret (smoke=${SMOKE_RESULT}, validate=${VALIDATE_RESULT})',
  details: 'Type: ${TASK_TYPE}\nStatus: ${DIARY_STATUS}\nSmoke-test: ${SMOKE_RESULT}\nValidate: ${VALIDATE_RESULT}\nFiler: ${FILE_COUNT}'
};
fs.appendFileSync('$DIARY_FILE', JSON.stringify(entry) + '\n');
console.log('  ✅ Diary entry lagret');
" 2>/dev/null || echo "  ⚠️  Kunne ikke skrive diary"

# ── 5. Oppsummering ───────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "   ✅ Session-summary: $SUMMARY_FILE"
echo "   Smoke-test: $SMOKE_RESULT"
echo "   Kvalitets-gate: $VALIDATE_RESULT"
echo "═══════════════════════════════════════════════════════"
echo ""

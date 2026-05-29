#!/usr/bin/env bash
# KIMI Session Start Hook — Autoglass AS
# Lister aktive blockers fra PROJECT_STATE.md

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE_FILE="$REPO_ROOT/.kimi/PROJECT_STATE.md"

echo ""
echo "🚨 AKTIVE BLOCKERS (fra PROJECT_STATE.md):"
echo "────────────────────────────────────────────"

if [ -f "$STATE_FILE" ]; then
  # Extract blockers table (lines between | Prio | and > Historiske)
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

echo ""

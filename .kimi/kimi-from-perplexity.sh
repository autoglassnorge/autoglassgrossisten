#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# 🔍 KIMI FROM PERPLEXITY — "Kjør i KIMI" Shortcut
#
# Dette scriptet leser clipboard, parser etter KIMI-kommandoer fra
# Perplexity-svar, og kjører dem automatisk i ~/bilglass.
#
# Bruk:
#   1. Spør Perplexity om noe
#   2. Hvis Perplexity avslutter med ```kimi-blokk, kopier hele svaret
#   3. Kjør dette scriptet (Cmd+Shift+K eller terminal)
#   4. Scriptet parser og kjører KIMI-kommandoen automatisk
#
# Oppsett av hurtigtast (Mac):
#   - System Settings → Keyboard → Keyboard Shortcuts → Services
#   - Eller bruk Raycast/Alfred/Hammerspoon
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

PROJECT_DIR="/Users/taj/bilglass"

# ─── 1. LES CLIPBOARD ───
CLIPBOARD=$(pbpaste 2>/dev/null || echo "")

if [ -z "$CLIPBOARD" ]; then
  echo "❌ Clipboard er tomt. Kopier et Perplexity-svar først."
  exit 1
fi

# ─── 2. PARSE ETTER KIMI-KOMMANDO ───
# Ser etter ```kimi ... ``` blokker
KIMI_CMD=$(echo "$CLIPBOARD" | awk '
  /```kimi/ { capture=1; next }
  capture && /```/ { capture=0; exit }
  capture { print }
' | sed 's/^#.*//' | sed '/^$/d' | head -1)

# Alternativ: se etter "kimi glass-" direkte
if [ -z "$KIMI_CMD" ]; then
  KIMI_CMD=$(echo "$CLIPBOARD" | grep -oE 'kimi glass-[a-z]+[^"]*' | head -1 || true)
fi

# ─── 3. HVIS IKKE FUNNET ───
if [ -z "$KIMI_CMD" ]; then
  echo "⚠️  Ingen KIMI-kommando funnet i clipboard."
  echo ""
  echo "Perplexity-svar skal avslutte med:"
  echo '```kimi'
  echo 'kimi glass-<agent> --prompt "<oppgave>"'
  echo '```'
  echo ""
  echo "Du kan også lime inn kommandoen manuelt:"
  read -r -p "KIMI-kommando: " MANUAL_CMD
  KIMI_CMD="$MANUAL_CMD"
fi

# ─── 4. KJØR KOMMANDOEN ───
echo ""
echo "🚀 Kjører: $KIMI_CMD"
echo "   Prosjekt: $PROJECT_DIR"
echo ""

cd "$PROJECT_DIR" || exit 1

# Kjør i ny terminal (hvis tilgjengelig)
if command -v osascript &> /dev/null; then
  osascript -e "
    tell application \"Terminal\"
      do script \"cd $PROJECT_DIR && echo '🔍 Perplexity → KIMI' && $KIMI_CMD\"
      activate
    end tell
  "
else
  # Fallback: kjør direkte
  eval "$KIMI_CMD"
fi

echo ""
echo "✅ Ferdig. Sjekk terminal-vinduet for KIMI-output."

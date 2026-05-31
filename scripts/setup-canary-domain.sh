#!/bin/bash
# Setup Canary Domain: app.auto-glass.no
# =======================================
# Kjør dette scriptet med dine Cloudflare credentials
#
# Bruk:
#   export CF_API_TOKEN="din_token_her"
#   export CF_EMAIL="din@email.com"
#   ./scripts/setup-canary-domain.sh

set -e

# Konfigurasjon
ACCOUNT_ID="2266e975a1d0ff5356bba1af884a2773"
PROJECT_NAME="autoglass-frontend"
DOMAIN="app.auto-glass.no"

echo "🚀 Setter opp canary domain: $DOMAIN"
echo "========================================"

# Sjekk credentials
if [ -z "$CF_API_TOKEN" ] && [ -z "$CF_EMAIL" ]; then
  echo "❌ Feil: Sett CF_API_TOKEN eller CF_EMAIL/CF_API_KEY"
  echo ""
  echo "Alternativ 1 (API Token):"
  echo "  export CF_API_TOKEN='din_token'"
  echo ""
  echo "Alternativ 2 (Global Key):"
  echo "  export CF_EMAIL='din@email.com'"
  echo "  export CF_API_KEY='din_global_key'"
  exit 1
fi

# Legg til domain
echo "📡 Kaller Cloudflare API..."

if [ -n "$CF_API_TOKEN" ]; then
  # Bruk API Token
  RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/domains" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$DOMAIN\"}")
else
  # Bruk Global API Key
  RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/domains" \
    -H "X-Auth-Email: $CF_EMAIL" \
    -H "X-Auth-Key: $CF_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$DOMAIN\"}")
fi

# Sjekk resultat
if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Domain lagt til!"
  echo ""
  echo "DNS vil bli automatisk konfigurert av Cloudflare."
  echo "Vent 2-3 minutter, deretter test:"
  echo "  curl https://$DOMAIN/"
  echo ""
  echo "Start monitoring:"
  echo "  node scripts/canary-monitor.mjs"
else
  echo "❌ Feil ved oppsett:"
  echo "$RESPONSE" | jq '.errors[]' 2>/dev/null || echo "$RESPONSE"
  echo ""
  echo "Prøv manuell setup i Cloudflare Dashboard:"
  echo "  https://dash.cloudflare.com → Pages → $PROJECT_NAME → Custom domains"
fi

#!/bin/bash
# Wrangler wrapper — automatically loads CLOUDFLARE_API_TOKEN from .env.local
# Usage: source scripts/wrangler-with-env.sh
# Then: wrangler deploy, wrangler d1 execute ..., etc.

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.local"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ .env.local not found at $ENV_FILE"
    echo "   Copy from .env.example and fill in secrets."
    return 1
fi

# Extract CLOUDFLARE_API_TOKEN (skip commented lines)
API_TOKEN=$(grep -E '^CLOUDFLARE_API_TOKEN=' "$ENV_FILE" | cut -d'=' -f2- | tr -d ' \t')
ACCOUNT_ID=$(grep -E '^CLOUDFLARE_ACCOUNT_ID=' "$ENV_FILE" | cut -d'=' -f2- | tr -d ' \t')

if [ -z "$API_TOKEN" ] || [ "$API_TOKEN" = "din_token_her" ]; then
    echo "❌ CLOUDFLARE_API_TOKEN not set in .env.local"
    echo ""
    echo "   To enable automated deploys:"
    echo "   1. Go to https://dash.cloudflare.com/profile/api-tokens"
    echo "   2. Create a token with: Workers Scripts:Edit, D1:Edit, Account:Read"
    echo "   3. Uncomment and set CLOUDFLARE_API_TOKEN in .env.local"
    echo ""
    return 1
fi

export CLOUDFLARE_API_TOKEN="$API_TOKEN"
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"

echo "✅ Wrangler env loaded"
echo "   Account: ${ACCOUNT_ID:0:8}..."
echo "   Token: ${API_TOKEN:0:8}..."
echo ""
echo "   You can now run wrangler commands directly:"
echo "   wrangler deploy"
echo "   wrangler d1 execute glass-catalog-db --command='SELECT 1' --remote --yes"

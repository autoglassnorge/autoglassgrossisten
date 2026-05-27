#!/bin/bash
# Nord Glass PDF → Staging SQL Pipeline
# Usage: ./scripts/run-nordglass-pipeline.sh [path/to/659486770-Nord-Glass.pdf]

set -euo pipefail

PDF="${1:-659486770-Nord-Glass.pdf}"
TXT="nordglass.txt"
SQL="nordglass-staging.sql"

if [ ! -f "$PDF" ]; then
  echo "❌ PDF not found: $PDF"
  echo "   Place the Nord Glass PDF in the repo root or provide the path:"
  echo "   ./scripts/run-nordglass-pipeline.sh path/to/659486770-Nord-Glass.pdf"
  exit 1
fi

echo "📄 Extracting text from $PDF ..."
pdftotext -layout "$PDF" "$TXT"
LINES=$(wc -l < "$TXT" | tr -d ' ')
echo "   → $LINES lines extracted → $TXT"

echo "🔧 Running parser pipeline ..."
npx tsx lib/nordglass/extract.ts parse "$TXT" "$SQL"

echo ""
echo "✅ Done! Output: $SQL"

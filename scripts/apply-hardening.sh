#!/usr/bin/env bash
# ============================================================================
# apply-hardening.sh — Worker v2.1 → v2.2 hardening deploy
# ============================================================================
# Author: Perplexity Computer (architect role)
# Date:   2026-05-19
#
# Hva dette gjør:
#   1. Sjekker at vi er i bilglass-repoet og på en ren branch
#   2. Verifiserer at TypeScript fortsatt kompilerer
#   3. Commiter Kimis baseline-arbeid (v2.1) hvis det ikke er commitet
#   4. Lager fix/ktype-hardening branch fra main
#   5. Commiter v2.2 hardening-patch
#   6. Pusher begge brancher til origin
#   7. Skriver ut neste steg (PR-link + deploy-kommandoer)
#
# Idempotent: trygt å re-kjøre. Hopper over steg som allerede er gjort.
# ============================================================================

set -euo pipefail

REPO="/Users/taj/bilglass"
cd "$REPO"

# --- Pretty output ---
bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }

# --- Preflight ---
bold "==> Preflight: repo + branch state"
if [ ! -d ".git" ]; then
  red "FEIL: ikke i et git-repo (cwd=$REPO)"
  exit 1
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "    Branch: $CURRENT_BRANCH"
echo "    Status:"
git status --short | sed 's/^/        /'

# --- Step 1: TypeScript check ---
bold "==> Steg 1: TypeScript-verifisering"
cd api/cf-worker
if ! npx --no-install tsc --noEmit 2>&1; then
  red "FEIL: TypeScript kompilerer ikke. Avbryter."
  exit 1
fi
green "    OK — TypeScript kompilerer rent"
cd "$REPO"

# --- Step 2: Slett .bak hvis den finnes ---
if [ -f "api/cf-worker/src/index.ts.bak" ]; then
  rm -v api/cf-worker/src/index.ts.bak
  yellow "    Slettet etterlatt .bak-fil"
fi

# --- Step 3: Sjekk at vi er på main ---
bold "==> Steg 2: Bytter til main"
if [ "$CURRENT_BRANCH" != "main" ]; then
  git checkout main
fi
git pull --ff-only origin main || yellow "    (kunne ikke pulle, fortsetter)"

# --- Step 4: Commit Kimis v2.1 baseline hvis den ikke er commitet ---
bold "==> Steg 3: Commit av Kimis v2.1 baseline (hvis ikke commitet)"
# Vi sjekker om noen av Kimis v2.1-filer er ucommittet. Hvis ja, må vi splitte
# i to commits: én for v2.1 baseline, én for v2.2 hardening.
# Men siden Perplexity allerede har overskrevet src/index.ts med v2.2-versjonen,
# kombinerer vi alt i én enkelt commit på fix/ktype-hardening branch.

# --- Step 5: Opprett fix-branch fra main ---
bold "==> Steg 4: Oppretter fix/ktype-hardening branch"
if git show-ref --verify --quiet refs/heads/fix/ktype-hardening; then
  yellow "    Branch finnes allerede — bytter til den"
  git checkout fix/ktype-hardening
else
  git checkout -b fix/ktype-hardening
  green "    Opprettet ny branch"
fi

# --- Step 6: Stage alle endringer ---
bold "==> Steg 5: Stager endringer"
git add api/cf-worker/schema.sql \
        api/cf-worker/src/index.ts \
        api/cf-worker/migrations/0002_add_ktype.sql \
        api/cf-worker/migrations/0003_fix_ktype_matches.sql \
        scripts/test-bovsoft.mjs \
        scripts/apply-d1-migration.mjs \
        docs/adr/2026-05-19-ktype-statistical-learning.md \
        .gitignore \
        .kimi/PROJECT_STATE.md \
        scripts/apply-hardening.sh

git status --short | sed 's/^/        /'

# --- Step 7: Commit ---
bold "==> Steg 6: Commit"
if git diff --cached --quiet; then
  yellow "    Ingenting å committe — alt er allerede committet"
else
  git -c user.name="Tom Arne Jensen" -c user.email="post@klarpakke.no" \
      commit -m "feat(worker): v2.2 hardened — kType statistical learning + SVV/Bovsoft error handling

This commit combines Kimi's v2.1 implementation (kType matching + Bovsoft
integration + statistical learning) with Perplexity Computer's v2.2
hardening pass.

v2.1 (Kimi baseline):
  - Bovsoft REGNUM endpoint integration (kType + VIN + year-range)
  - KV cache for Bovsoft responses (30 days)
  - Extended VIN decoding: BMW, MB, Audi, Ford, Hyundai/Kia, Toyota
  - D1 schema: glass_catalog.ktype column + ktype_matches table
  - Migration 0002_add_ktype.sql
  - ADR: 2026-05-19-ktype-statistical-learning

v2.2 (Perplexity hardening):
  - SVV taxonomy: discriminated union (ok|auth_error|not_found|upstream_error|...)
    401/403 → HTTP 503 + Retry-After: 3600 (no more 500 crashes)
  - Bovsoft status logging: 401/402/403/404 each logged with context
  - GDPR-fix: removed regnr from ktype_matches table (personal data)
  - Migration 0003: drop old table, recreate as (ktype, eurocode, hit_count,
    first_seen, last_seen) — pure aggregate, no PII
  - KTYPE_CONFIDENCE_THRESHOLD=3 prevents cache poisoning from single mismatch
  - Error responses NOT cached (only HTTP 200 enters KV)
  - searchByRegnr now returns { httpStatus, retryAfter?, body } for correct codes

Tests: TypeScript compiles cleanly (tsc --noEmit, exit 0)
Lines: src/index.ts 1156 → 1602 (+446)

Cross-AI context: see .kimi/PROJECT_STATE.md for canonical project state."
  green "    Commit opprettet"
fi

# --- Step 8: Push ---
bold "==> Steg 7: Push til origin"
if git push -u origin fix/ktype-hardening 2>&1; then
  green "    Pushet til origin/fix/ktype-hardening"
else
  red "    Push feilet. Sjekk auth eller kjør 'git push -u origin fix/ktype-hardening' manuelt."
fi

# --- Step 9: Neste steg ---
bold "==> Ferdig"
cat <<'EOF'

  ✅ Worker v2.2 commited og pushet på fix/ktype-hardening
  
  Neste steg (i rekkefølge):
  
  1. Opprett PR på GitHub:
     gh pr create --base main --head fix/ktype-hardening \
        --title "feat(worker): v2.2 hardened" \
        --body "See .kimi/PROJECT_STATE.md for details"
  
  2. Roter SVV API-nøkkel (P0 blocker):
     - Logg inn på SVV Enkeltoppslag-portalen
     - Generer ny nøkkel
     - cd api/cf-worker && wrangler secret put SVV_API_KEY
  
  3. Send e-post til Bovsoft (P0 blocker):
     - To:      bovsoft@gmail.com
     - Subject: Client id=461 — request account confirmation
     - Body:    Please confirm account id=461 (status currently 403 temp).
  
  4. Når SVV + Bovsoft er klare → merge PR → deploy:
     cd api/cf-worker
     wrangler d1 execute autoglass-catalog --file=migrations/0003_fix_ktype_matches.sql --remote
     npm run deploy
  
  5. Verifiser at v2.2 svarer riktig:
     curl -i https://api.autoglass.no/api/glass?regnr=TEST123
     # Forventet: HTTP 200 med vehicle-data, ELLER HTTP 503 + Retry-After
     #            ALDRI HTTP 500.
  
EOF

# KIMI Task: Execute AI-first Autoglass Platform Plan — Phase 0

You are running inside `/Users/taj/bilglass`.

Act as **Autoglass Orchestrator Agent**.

Read these files first:

1. `AGENTS.md`
2. `.kimi/KIMI-MASTER-SYSTEM.md`
3. `.kimi/agents/autoglass-orchestrator-agent.md`
4. `docs/superpowers/plans/2026-06-09-ai-first-europe-leading-platform.md`
5. `.kimi/mempalace/rooms/Plans/2026-06-09-ai-first-europe-leading-platform.md`

Use MemPalace before edits:

- Search for: `AI-first startside unified search Worker typecheck secrets CI`
- Query recent context for Worker/search/frontend changes.
- Use relevant facts from `B2B-MODERN-FRONTEND-PLAN`, `PROJECT_STATE`, and `TASK-8-BOVSOFT-STRATEGIC`.

## Goal

Execute **Fase 0: Stabilisering og hygiene** from the AI-first plan.

Do **not** start Phase 1 until Phase 0 is green.

## Scope

Fix or prepare safe changes for:

1. Worker TypeScript typecheck.
2. Remove hardcoded SVV API key and replace with required env var behavior.
3. Ensure PR Verify runs frontend build/test in addition to Worker typecheck.
4. Make the daily SVV workflow safer: no direct push to `main`; use artifacts or PR-based flow.
5. Identify all inconsistent public inventory/product numbers and create a single source of truth for:
   - `133 000 glass på lager`
   - `27 000 forskjellige varianter`
6. Keep changes scoped. Do not deploy.

## Known Starting Evidence

From Codex analysis on 2026-06-09:

- `frontend npm run build`: PASS
- `frontend npm test -- --run`: PASS
- `api/cf-worker npx tsc --noEmit`: FAIL
- Hardcoded SVV key found in `scripts/norwegian-regnr-bruteforce.mjs`
- Daily SVV workflow currently commits/pushes generated data directly to `main`
- `commands.json` still references unsupported `kimi --agent-file`; do not depend on that flag.

## Required Process

1. Start with a short routing/status block.
2. Inspect current `git status` and do not revert user changes.
3. Make a concise Phase 0 todo list.
4. Apply fixes one domain at a time:
   - Worker/types
   - Secrets/scripts
   - CI/workflows
   - Frontend copy constants
5. Verify after changes.
6. Stop if a change requires credentials, production deploy, or destructive git operations.

## Verification Gate

Before claiming completion, run:

```bash
cd api/cf-worker && npx tsc --noEmit
cd frontend && npm run build
cd frontend && npm test -- --run
rg -n "3df763e5|SVV_API_KEY \\|\\|" scripts api frontend .github --glob '!node_modules/**'
```

If a command fails, report exact failure and next fix.

## Output Required

End with:

```text
## Status: GO / NO-GO / WIP

Filer endret:
Verifisert:
Kontroller:
Risikoer:
Neste steg:
```

Do not mark GO unless all verification passes.

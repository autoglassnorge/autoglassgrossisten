# ADR: KIMI CLI-agenter for domene-spesialisering

## Kontekst

Prosjektet vokser i kompleksitet (scrapere, Worker, frontend, deploy).
Én generisk agent har ikke nok kontekst til å gjøre gode beslutninger på tvers av domener.

## Problem

Hvordan sikre at AI-hjelp er kontekst-rik og domene-korrekt?

## Alternativer

### 1. KIMI CLI-agenter (YAML+MD) (valgt)
- Minimal YAML-wrapper + detaljert MD-system prompt
- CLI-aliaser: `kimi glass-data`, `kimi glass-worker`, etc.
- Master system prompt for universelle regler

### 2. Cursor/Antigravity-agenter
- IDE-integrert, men låst til Cursor
- Mindre egnet for CI/CD-arbeid

### 3. Ingen agenter (status quo)
- Generisk KIMI uten kontekst → feil som loadCatalog-bugen

## Valg

**KIMI CLI-agenter** — 5 domene-agenter + master prompt.

## Konsekvenser

- `.kimi/` mappe med 10+ filer
- Agent-filer må vedlikeholdes ved stack-endringer
- CLI-aliaser krever at `commands.json` lastes inn

## Status

Godkjent — 2026-05-18

# ADR: Daglig scraper med kvalitets-gate

## Kontekst

Katalogen vokser kontinuerlig via scrapere fra 4 kilder (Pilkington, Glavista, Euroglass.ru, Autoglass.ru).
Manuell kjøring er upålitelig og tidskrevende.

## Problem

Hvordan automatisere data-pipeline uten å risikere dårlig data i produksjon?

## Alternativer

### 1. Daglig cron med kvalitets-gate (valgt)
- GitHub Actions cron kl 06:00 CET
- Scraper → merge → valider → upload til KV
- BLOCK ved avvik > 20%

### 2. Ukentlig manuell kjøring
- Lavere risiko, men data blir raskt utdatert

### 3. Real-time sync
- For komplekst for nåværende volum

## Valg

**Daglig cron med kvalitets-gate**.

## Konsekvenser

- `scripts/validate-catalog.mjs` MÅ passes før KV-upload
- Daglig rapport genereres som artifact
- Feil trigger GitHub Issue automatisk

## Status

Godkjent — 2026-05-18

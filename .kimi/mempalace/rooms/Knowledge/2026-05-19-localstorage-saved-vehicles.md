# ADR-006: localStorage for lagrede kjøretøy (MVP)

## Status
Godkjent

## Kontekst
Kundeportalen skal vise lagrede kjøretøy for autentiserte brukere. I MVP-fasen ønsket vi å unngå komplekse backend-endringer.

## Beslutning
Bruke `localStorage` med nøkkel `ag_vehicles_${email}` og `ag_searches_${email}`.

## Begrunnelse
- Ingen backend-endring nødvendig
- Umiddelbart tilgjengelig etter login
- Enkelt å migrere til D1 senere (samme datastruktur)
- B2B-kunder bruker typisk samme enhet

## Migreringsplan (fremtidig)
Når brukerdata skal deles på tvers av enheter:
1. Opprett D1-tabell `user_vehicles`
2. Sync fra localStorage ved første login
3. Erstatt localStorage med D1-queries

## Dato
2026-05-19

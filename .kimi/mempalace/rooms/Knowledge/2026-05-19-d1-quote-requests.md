# ADR-005: D1 `quote_requests` over e-post

## Status
Godkjent

## Kontekst
"Be om pris"-knapper i søkeresultater gjorde ingenting. Vi trengte en måte å lagre forespørsler på.

## Alternativer vurdert
| Alternativ | Fordeler | Ulemper |
|---|---|---|
| **A: D1-tabell** (valgt) | Strukturert, querybart, admin-klart, gratis | Krever D1-schema |
| B: E-post til salgs@autoglass.no | Enkelt, umiddelbart | Ustrukturert, vanskelig å administrere |
| C: Slack-webhook | Rask varsling | Krever Slack, ikke persistent |

## Beslutning
D1-tabell `quote_requests` med felter:
- `id`, `email`, `eurocode`, `regnr`, `quantity`, `message`, `status`, `created_at`

## Konsekvenser
- Admin-endepunkt `/api/admin/quotes` kan hente alle forespørsler
- Status-feltet muliggjør arbeidsflyt: `new` → `processed` → `quoted` → `accepted`
- Kan filtrere, sortere, og eksportere

## Dato
2026-05-19

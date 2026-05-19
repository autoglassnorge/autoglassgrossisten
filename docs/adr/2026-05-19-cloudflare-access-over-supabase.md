# ADR-004: Cloudflare Access over Supabase Auth

## Status
Godkjent

## Kontekst
Kundeportalen (`kundeportal.html`) brukte opprinnelig Supabase Auth med magic link + passord. Dette krevde:
- Egen Supabase-prosjekt
- Supabase JS-bibliotek (CDN)
- `window.__AG_CONFIG__` for URL/key
- Egen brukerdatabase i Supabase

## Beslutning
Bytte til **Cloudflare Access** for autentisering.

## Begrunnelse
| Kriterium | Supabase | Cloudflare Access |
|---|---|---|
| Leverandører | 2 (Cloudflare + Supabase) | 1 (Cloudflare) |
| JS-bibliotek | ~80KB CDN | 0KB (server-side) |
| Identity providers | E-post + OAuth | OTP, Google, Microsoft, m.m. |
| Integrasjon med Worker/Pages | Indirekte | Naturlig (samme økosystem) |
| B2B-egnethet | OK | Bedre (OTP = ingen passord å huske) |
| Kostnad | Gratis-tier | Gratis-tier |

## Konsekvenser
- `js/auth.js` er fullstendig refaktorert
- `CF-Access-Authenticated-User-Email` header brukes i Worker
- Ingen passord-håndtering i frontend
- Cloudflare Access må konfigureres i dashboard for aktivering

## Implementasjon
- `GET /api/me` — sjekker CF Access-header, returnerer e-post
- `GET /api/admin/quotes` — beskyttet, krever autentisert bruker
- `js/auth.js` — kaller `/api/me`, viser login/logout basert på respons

## Dato
2026-05-19

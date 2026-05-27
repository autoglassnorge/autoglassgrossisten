# Perplexity + KIMI Arbeidsflyt for Autoglass AS

> Denne filen beskriver når du skal bruke Perplexity vs KIMI CLI, og hvordan de samarbeider.

---

## Når bruke hva?

| Oppgave | Primær verktøy | Sekundær verktøy | Hvorfor |
|---------|---------------|------------------|---------|
| Kode-endringer >3 filer | **KIMI CLI** + MemPalace | Perplexity (research) | MemPalace gir kontekst, KG, diary. Perplexity brukes KUN for research-fase. |
| Scraping / data-merge | **KIMI glass-data** | Perplexity (leverandør-info) | KIMI eier data-pipeline. Perplexity for research om nye kilder. |
| API-endepunkter / Worker | **KIMI glass-worker** | Perplexity (Cloudflare docs) | KIMI skriver kode. Perplexity for debugging og docs. |
| Frontend / SEO / i18n | **KIMI glass-web** | Perplexity (SEO-trender) | KIMI implementerer. Perplexity for trend-research. |
| Deploy / CI/CD | **KIMI glass-ops** | Perplexity (best practices) | KIMI utfører. Perplexity for sikkerhetsadvarsler. |
| Arkitektur-beslutninger | **KIMI glass-arch** + Perplexity | MemPalace KG | Kombinert: Perplexity for research, KIMI for beslutning og ADR. |
| kType / Bovsoft / SVV | **KIMI glass-ktype** | Perplexity (TecDoc/OEM) | KIMI eier matching-logikk. Perplexity for OEM-spesifikasjoner. |
| Markedsresearch | **Perplexity Pro** direkte | KIMI (implementere funn) | Perplexity er best for dyp research. KIMI implementerer funn. |
| Daglig oppdatering / nyheter | **Perplexity Pro** direkte | — | Perplexity for rask oversikt. |

---

## Typisk arbeidsflyt: "Research → Kode → Logg"

### 1. Research-fase (Perplexity)
```
Bruker: "Hva er siste endringer i TecDoc kType-standarden?"
→ Perplexity søker og gir svar
→ Hvis handling trengs: avslutter med KIMI-kommando-forslag
```

### 2. Kode-fase (KIMI CLI)
```
Bruker kopierer KIMI-kommandoen
→ KIMI agent kjører med MemPalace-kontekst
→ Agent bruker kg_query og search FØR kode-endringer
→ Kode skrives og testes
```

### 3. Logg-fase (MemPalace)
```
Etter endringer:
→ kg_add for å lagre nye fakta
→ write_diary for å logge hva som ble gjort
→ smoke-test hvis >3 filer endret
```

---

## "Kjør i KIMI" — Fra Perplexity til KIMI

### Metode A: Kopier kommando (Desktop + Web)
1. Spør Perplexity om noe
2. Hvis Perplexity avslutter med ````kimi`-blokk: kopier kommandoen
3. Lim inn i terminal: `cd ~/bilglass && <kommando>`

### Metode B: Hurtigtast (Mac)
1. Spør Perplexity
2. Cmd+Shift+K → trigger Apple Shortcut
3. Shortcut kopierer siste Perplexity-svar, parser KIMI-kommando, kjører i terminal

### Metode C: Manuell
1. Spør Perplexity
2. Les svaret, forstå hva som trengs
3. Kjør riktig KIMI-agent manuelt:
   ```bash
   cd ~/bilglass
   kimi glass-worker --prompt "<din oppgave>"
   ```

---

## Sync-protokoll

### Perplexity → MemPalace
Etter Perplexity-research som påvirker kode eller arkitektur:
```bash
# Legg til i KG
cd ~/bilglass
node -e "
const cp = require('child_process');
const child = cp.spawn('node', ['.kimi/mempalace/mcp-server.mjs']);
// ... send kg_add via MCP
"
```

### KIMI → Perplexity
Etter KIMI-session med Perplexity-bruk:
- Logg i diary hvilken Perplexity-research som ble brukt
- Inkluder søkestrengen i diary-entry

---

## Viktige begrensninger

1. **Perplexity Desktop har ingen offisiell API.** "Kjør i KIMI" er en workaround basert på Custom Instructions + kopiering.
2. **Perplexity MCP kjøres INNI KIMI.** Det motsatte (Perplexity styrer KIMI) er ikke teknisk mulig uten workaround.
3. **PERPLEXITY_API_KEY** må være satt i miljøet for at MCP-serveren skal fungere.

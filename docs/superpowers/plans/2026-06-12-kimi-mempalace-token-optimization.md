# KIMI + MemPalace Token-Optimalisering

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redusere token-forbruk for KIMI Code CLI og MemPalace uten å svekke kvaliteten på kode, kontekst eller verifikasjon.

**Architecture:** Gjør forsiktige, målbare justeringer på output-grenser og debounce-tider i `.kimi/config.toml` og `.kimi/mempalace/mcp-server.mjs`, samtidig som vi oppdaterer kommentarer og dokumentasjon for K2.7 Code / 256K context. Ingen endringer i forretningslogikk, agent-prompts eller thinking-output.

**Tech Stack:** TOML, Node.js, Markdown

---

## Task 1: Reduser background output-grenser i config.toml

**Files:**
- Modify: `.kimi/config.toml:22-25`
- Test: `python3 -c "import tomllib; tomllib.load(open('.kimi/config.toml', 'rb'))"`

- [ ] **Step 1: Reduser `read_max_bytes` fra 50000 til 35000**

```toml
# 0.14.2: økt for større fil-output fra scraper-scripts
# Redusert fra 50000 → 35000 for token-sparing. Gir fortsatt ~8-9K tokens output.
read_max_bytes = 35000
```

- [ ] **Step 2: Reduser `notification_tail_chars` fra 5000 til 3000**

```toml
# 0.14.2: mer kontekst i background notifications
# Redusert fra 5000 → 3000 for token-sparing. 3000 chars dekker de fleste feilmeldinger/sammendrag.
notification_tail_chars = 3000
```

- [ ] **Step 3: Øk file-watcher debounce i MemPalace for færre reindexeringer**

Dette gjøres i Task 2.

- [ ] **Step 4: Valider TOML**

Run:
```bash
cd /Users/taj/bilglass && python3 -c "import tomllib; tomllib.load(open('.kimi/config.toml', 'rb')); print('config.toml OK')"
```

Expected: `config.toml OK`

---

## Task 2: Oppdater MemPalace-konfigurasjon for K2.7 / 256K context

**Files:**
- Modify: `.kimi/mempalace/mcp-server.mjs:64-75`
- Test: `node -e "import('./.kimi/mempalace/mcp-server.mjs')"` (syntax check, server starter ikke uten MCP transport)

- [ ] **Step 1: Oppdater kommentar for `maxToolOutputChars` fra 262K til 256K context**

```javascript
maxToolOutputChars: 20000, // redusert fra 75000 — ~8% av 256K kontekst, gir headroom
```

- [ ] **Step 2: Øk `fileWatcherDebounceMs` fra 2000 til 3000 ms**

```javascript
fileWatcherDebounceMs: 3000, // 3s debounce for å unngå reindex-storm og spare CPU/token-oppstart
```

- [ ] **Step 3: Vurder/reduser `maxResultChars` fra 600 til 500 (valgfritt)**

Denne endringen er **ikke obligatorisk** første runde. Hvis Task 1+2 ikke gir tilstrekkelig effekt, vurder:

```javascript
maxResultChars: 500,      // redusert fra 2500 → 500. Testet med limit=5 gir 2500 chars totalt.
```

La den stå på 600 inntil videre.

- [ ] **Step 4: Syntax-sjekk**

Run:
```bash
cd /Users/taj/bilglass && node --check .kimi/mempalace/mcp-server.mjs
```

Expected: ingen output (suksess)

---

## Task 3: Dokumenter token-sparingsstrategi i AGENTS.md

**Files:**
- Modify: `AGENTS.md` (etter KIMI Code 0.14.2-seksjonen)

- [ ] **Step 1: Legg til ny seksjon "Token-sparing (0.14.2)"**

```markdown
---

### Token-sparing (0.14.2)

Disse innstillingene er justert for å redusere token-forbruk uten å svekke kvalitet:

| Komponent | Innstilling | Fra | Til | Begrunnelse |
|---|---|---|---|---|
| `config.toml` | `read_max_bytes` | 50000 | 35000 | Bakgrunns-output fra scrapere sjelden trenger >35KB |
| `config.toml` | `notification_tail_chars` | 5000 | 3000 | 3000 chars dekker feilmeldinger/sammendrag |
| `mcp-server.mjs` | `fileWatcherDebounceMs` | 2000ms | 3000ms | Færre unødvendige reindexeringer |
| `mcp-server.mjs` | `maxToolOutputChars` | 75000 | 20000 | Fast grense, oppdatert for 256K K2.7 context |
| `mcp-server.mjs` | `maxResultChars` | 2500 | 600 | Fokus på mest relevante snippets |
| `mcp-server.mjs` | `cacheSize` | 500 | 100 | Tilstrekkelig for Bilglass-prosjektet |

**Prinsipp:** Spar tokens på output-grenser og unødvendige reindexeringer, ikke på system-prompts eller thinking-output.
```

- [ ] **Step 2: Oppdater "Sist oppdatert" og versjon i AGENTS.md**

Endre til:
```markdown
**Sist oppdatert:** 2026-06-12  
**Versjon:** 3.4 (+KIMI + MemPalace token-optimalisering)
```

- [ ] **Step 3: Synkroniser MemPalace-kopi**

Gjenta Step 1-2 i `.kimi/mempalace/rooms/Knowledge/AGENTS.md`.

---

## Task 4: Verifikasjon

- [ ] **Step 1: Kjør TOML-validering**

```bash
cd /Users/taj/bilglass && python3 -c "import tomllib; tomllib.load(open('.kimi/config.toml', 'rb')); print('config.toml OK')"
```

Expected: `config.toml OK`

- [ ] **Step 2: Kjør Node-syntax-sjekk på MemPalace**

```bash
cd /Users/taj/bilglass && node --check .kimi/mempalace/mcp-server.mjs
```

Expected: ingen output

- [ ] **Step 3: Søk etter gjenværende utdaterte referanser**

```bash
cd /Users/taj/bilglass && grep -R "0.11.0\|k2\.6\|262k" .kimi/ --include="*.md" --include="*.mjs" --include="*.toml" --include="*.yaml" 2>/dev/null || true
```

Expected: kun treff i historiske planer eller auto-genererte filer.

---

## Self-Review

**Spec coverage:** Alle identifiserte token-sparepunkter er dekket: output-grenser, debounce, dokumentasjon.

**Placeholder scan:** Ingen TBD/TODO. Alle endringer viser konkrete verdier.

**Type consistency:** Ingen nye typer. Verdier er tall/string som før.

**Kvalitetsrisiko:** Lav. Ingen endringer i system-prompts, thinking-output, forretningslogikk eller agent-instruksjoner.

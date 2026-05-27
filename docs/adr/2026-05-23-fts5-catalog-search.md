# ADR: FTS5 for /api/catalog/search

**Dato:** 2026-05-23  
**Status:** Under vurdering (ikke godkjent)  
**Eier:** glass-worker / glass-arch

---

## Kontekst

`/api/catalog/search` bruker i dag:

```sql
SELECT * FROM glass_catalog
WHERE (eurocode LIKE ? OR brand LIKE ? OR model LIKE ? OR description LIKE ?)
  AND brand = ?
  AND category = ?
  AND year_from <= ?
  AND year_to >= ?
ORDER BY year_from DESC NULLS LAST
LIMIT ? OFFSET ?
```

Med 37 581 rader og leading-wildcard (`%q%`) kan ikke SQLite bruke B-tree indekser effektivt. Hvert `LIKE %q%` resulterer i full table scan.

---

## Alternativ: FTS5 (Full-Text Search v5)

SQLite FTS5 er tilgjengelig i Cloudflare D1. Det gir:

- **Prefix-søk:** `volvo*` matcher "volvo", "volvov90", etc.
- **Boolsk søk:** `volvo AND frontrute`
- **Ranking:** BM25-relevans-score
- **Raskere:** typisk 10-100x raskere enn `LIKE %q%` på 30k+ rader

### Implementasjon

```sql
-- Virtuell FTS5-tabell koblet til glass_catalog
CREATE VIRTUAL TABLE IF NOT EXISTS glass_catalog_fts USING fts5(
  eurocode,
  brand,
  model,
  description,
  content='glass_catalog',
  content_rowid='id'
);

-- Triggers for automatisk synkronisering
CREATE TRIGGER IF NOT EXISTS glass_catalog_fts_insert
AFTER INSERT ON glass_catalog BEGIN
  INSERT INTO glass_catalog_fts(rowid, eurocode, brand, model, description)
  VALUES (new.id, new.eurocode, new.brand, new.model, new.description);
END;

CREATE TRIGGER IF NOT EXISTS glass_catalog_fts_delete
AFTER DELETE ON glass_catalog BEGIN
  INSERT INTO glass_catalog_fts(glass_catalog_fts, rowid, eurocode, brand, model, description)
  VALUES ('delete', old.id, old.eurocode, old.brand, old.model, old.description);
END;
```

Query-endring:
```sql
SELECT g.* FROM glass_catalog_fts f
JOIN glass_catalog g ON g.id = f.rowid
WHERE glass_catalog_fts MATCH ?
  AND brand = ?
ORDER BY rank
LIMIT ? OFFSET ?;
```

---

## Gevinst

| Mål | Nåværende | Med FTS5 |
|-----|-----------|----------|
| Søk 37k rader | ~200-500ms (full scan) | ~5-20ms (inverted index) |
| Komplekse queries | Enkel OR over 4 kolonner | Prefix + boolsk + ranking |
| Skalerbarhet | O(n) med tabellstørrelse | O(m) der m = treff |
| Brukeropplevelse | Merkbar ventetid | Nærmest umiddelbar |

## Risiko

| Risiko | Sannsynlighet | Konsekvens | Mitigering |
|--------|--------------|------------|------------|
| D1-begrensning for virtuelle tabeller | Lav | Kan ikke migrere | Teste i staging først |
| Økt lagringsbruk | Middels | ~2-3x større DB | D1 har 500MB gratis; tålelig |
| Trigger-kompleksitet | Middels | Import/re-import blir tregere | Batch-insert via `INSERT INTO fts SELECT ...` |
| Syntax-endring i søk | Høy | Brukere må lære ny syntax | Translasjonslag: `volvo frontrute` → `volvo AND frontrute` |
| Bakoverkompatibilitet | Høy | Eksisterende indekser må beholdes | FTS5 er supplement, ikke erstatning |

## Anbefaling

**Avvent.** 

Grunner:
1. Nåværende søk er tilstrekkelig for 37k rader (sub-sekund)
2. Nye sekundære indekser (0011) vil forbedre filtrerte søk betraktelig
3. KV-cache for /api/catalog/search (180s TTL) reduserer D1-last
4. FTS5 introduserer betydelig kompleksitet (triggers, virtuelle tabeller, synkronisering)

**Gates for FTS5-vurdering:**
- Tabellen overstiger 100 000 rader
- Gjennomsnittlig søketid > 500ms (p95)
- Brukerfeedback indikerer treghet

---

## Neste steg

1. **Deploy migrasjon 0011** (sekundære indekser)
2. **Monitor** søkeytelse i 2 uker
3. **Hvis gates trigges:** POC med FTS5 i staging-miljø

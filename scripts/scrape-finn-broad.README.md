# Finn.no Broad Regnr Scraper

Production-ready scraper that extracts Norwegian license plates (regnr) from **all** car listings on Finn.no — not just Hella Gutmann ads.

## Purpose

Autoglass AS collects regnr to build kType → vehicle mappings via the Bovsoft API and other verification pipelines. The existing targeted scraper only searches ~500 brand+model combinations. This broad scraper casts a wider net by scraping **every** Norwegian car listing on Finn.no.

## Output Format

NDJSON (`data/finn-no-regnr/broad-scrape-YYYY-MM-DD.ndjson`), one record per line:

```json
{"regnr":"AB12345","finnkode":"123456789","brand":"BMW","model":"3-serie","year":2019,"url":"https://www.finn.no/mobility/item/123456789","scrapedAt":"2024-01-15T10:30:00.000Z"}
```

| Field     | Description                              |
|-----------|------------------------------------------|
| `regnr`   | Norwegian license plate (e.g. `AB12345`) |
| `finnkode`| Finn.no ad ID                            |
| `brand`   | Vehicle brand (parsed from title)        |
| `model`   | Vehicle model (parsed from title)        |
| `year`    | Model year (from title or ad page)       |
| `url`     | Direct link to the ad                    |
| `scrapedAt`| ISO-8601 timestamp                      |

## Usage

### Basic run

```bash
node scripts/scrape-finn-broad.mjs
```

### Quick test (3 pages, fast delay)

```bash
node scripts/scrape-finn-broad.mjs --test
```

### Resume after interruption

```bash
node scripts/scrape-finn-broad.mjs --resume
```

### Limit to N pages

```bash
node scripts/scrape-finn-broad.mjs --max-pages=50
```

### Adjust rate limit

Default is **1 request/second** (1000 ms). To go faster (not recommended in production):

```bash
node scripts/scrape-finn-broad.mjs --delay=500
```

### Custom output directory

```bash
node scripts/scrape-finn-broad.mjs --output-dir=/tmp/finn-scrape
```

### All options

| Flag              | Default                | Description                          |
|-------------------|------------------------|--------------------------------------|
| `--max-pages=N`   | unlimited              | Stop after N search pages            |
| `--delay=MS`      | 1000                   | Milliseconds between requests        |
| `--timeout=MS`    | 25000                  | Per-request hard timeout             |
| `--resume`        | false                  | Resume from last checkpoint          |
| `--output-dir=PATH`| `data/finn-no-regnr`  | Where to write NDJSON & reports      |
| `--test`          | false                  | Quick test: 3 pages, 500 ms delay    |

## npm Scripts

```bash
# Broad scrape
npm run scrape:finn-broad

# Test run
npm run scrape:finn-broad:test

# Resume
npm run scrape:finn-broad:resume
```

## How It Works

1. **Search pages** — Sequential requests to `https://www.finn.no/mobility/search/car?registration_class=1&page=N`
   - `registration_class=1` filters to Norwegian-registered cars only
   - Parses `<article>` tags to extract `finnkode`, brand, model, year from titles
   - Stops after 3 consecutive empty pages (end of catalog)

2. **Ad pages** — One request per listing to fetch the full ad HTML
   - Extracts regnr via regex pattern `\b[A-Z]{2}\d{3,5}\b`
   - Uses frequency scoring: the most common match on the page is the real plate
   - Falls back to ad-page structured data for year if title parsing fails

3. **Deduplication** — Loads existing output on startup to avoid duplicates across runs

4. **Checkpointing** — Saves progress after every search page:
   - `data/finn-no-regnr/broad-scrape-checkpoint.json`
   - Resume with `--resume` after crashes, Ctrl-C, or network issues

5. **Batch output** — Flushes records to NDJSON in batches of 50 for crash safety

## Rate Limiting & Ethics

- **Default delay: 1000 ms** between all requests (≈ 1 req/sec)
- Realistic Chrome User-Agent header
- Accept-Language set to `nb-NO`
- Respects HTTP 429 (waits 60 s) and HTTP 403 (waits 30 s)
- Hard timeout of 25 s per request to prevent hanging connections
- Max 3 retries with exponential backoff

## Files Produced

| File                                      | Description                          |
|-------------------------------------------|--------------------------------------|
| `broad-scrape-YYYY-MM-DD.ndjson`          | Raw scraped records (append-only)    |
| `broad-scrape-checkpoint.json`            | Resume state (last page, totals)     |
| `broad-scrape-report.json`                | Final summary with per-brand counts  |

## Estimating Runtime

Finn.no shows ~38 ads per search page. At 1 req/sec:

- 1 search page + ~38 ad pages = ~39 requests ≈ 39 seconds
- 100 pages ≈ 65 minutes
- 500 pages ≈ 5.4 hours
- 1000 pages ≈ 11 hours

Use `--max-pages` for controlled batches or run inside `screen`/`tmux` for long sessions.

## Resuming After Interruption

The scraper writes a checkpoint after **every search page**. If the process is killed:

```bash
# Simply resume
node scripts/scrape-finn-broad.mjs --resume
```

The output file is append-only, so partial data is never lost.

## Tips

- **Run in `tmux` or `screen`** for multi-hour sessions
- **Start with `--test`** to verify Finn.no HTML structure hasn't changed
- **Monitor disk space** — NDJSON files grow roughly 200–400 bytes per record
- **Combine with verify pipeline** after scraping:
  ```bash
  node scripts/verify-with-bovsoft.mjs data/finn-no-regnr/broad-scrape-2024-01-15.ndjson
  ```

## Troubleshooting

| Symptom                          | Likely Cause                          | Fix                                      |
|----------------------------------|---------------------------------------|------------------------------------------|
| `HTTP 429` repeatedly            | Rate limit triggered                  | Increase `--delay` to 1500+ ms           |
| `HTTP 403` repeatedly            | IP blocked or captcha                 | Pause scraping, try from different IP    |
| Empty pages immediately          | Finn.no HTML structure changed        | Check `--test` output, update parsers    |
| Zero regnr after many pages      | Regnr no longer displayed on ad pages | Check a single ad page manually          |
| Checkpoint not resuming          | Checkpoint file corrupt               | Delete `broad-scrape-checkpoint.json`    |

## Integration with kType Pipeline

1. Scrape regnr:
   ```bash
   node scripts/scrape-finn-broad.mjs --max-pages=100
   ```

2. Verify with Bovsoft to get kTypes:
   ```bash
   node scripts/verify-with-bovsoft.mjs data/finn-no-regnr/broad-scrape-$(date +%F).ndjson
   ```

3. Generate D1 inserts:
   ```bash
   node scripts/generate-ktype-inserts.mjs
   ```

4. Deploy to D1:
   ```bash
   wrangler d1 execute autoglass-db --file=generated-ktype-inserts.sql
   ```

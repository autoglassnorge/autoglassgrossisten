# Perplexity Pro — Memory Entries for Autoglass AS

> Kopier hver linje inn i Perplexity Pro:
> Settings → Memory → "Add memory"

---

1. **Autoglass AS er en B2B grossist for bilglass i Norge.** Selskapet selger til verksteder, ikke direkte til forbrukere.

2. **Stack: Cloudflare Worker + KV + D1 + Pages, Vanilla JS/HTML/CSS.** Ingen React/Next.js/Vercel. Statisk frontend, serverless backend.

3. **37 581 produkter med eurocode-matching via regnr/VIN.** Hvert produkt har eurocode (f.eks. 5351AFDHV) som unik ID. Matching går via SVV Enkeltoppslag eller Bovsoft REGNUM API.

4. **SVV API + Bovsoft REGNUM for kjøretøy-oppslag.** SVV er primær kilde. Bovsoft gir kType (TecDoc-identifikator). Bovsoft client id=461, status 403 pending confirmation.

5. **Ingen kobling til Klarpakke.** Autoglass AS er et helt separat prosjekt. Aldri foreslå Klarpakke-løsninger.

6. **MemPalace er prosjektets kunnskapshåndtering.** Isolert fra Klarpakke, ligger i ~/bilglass/.kimi/mempalace/. Inneholder KG med 12+ entiteter og diary for alle agenter.

7. **KIMI CLI har 6 agenter:** glass-data, glass-worker, glass-web, glass-ops, glass-arch, glass-ktype. Hver agent har spesifikt domene.

8. **Worker versjon v2.3 deployet.** 1602 linjer TypeScript. Viktigste fil: api/cf-worker/src/index.ts.

9. **GDPR: ktype_matches lagrer ALDRI regnr.** Kun ktype + eurocode + hit_count. Ingen personopplysninger i D1.

10. **Deploy-pipeline:** GitHub Actions → Cloudflare Worker først → KV-upload → Pages. Smoke-test etter hver deploy.

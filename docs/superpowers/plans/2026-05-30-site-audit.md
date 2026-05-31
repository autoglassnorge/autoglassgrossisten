# Site Audit Plan: Autoglass AS Nettside
**Dato:** 2026-05-30  
**Scope:** Startsiden + kritiske brukerflyter  
**Metode:** 4 spesialister parallelt

---

## Specialister & Oppgaver

### 1. Frontend-spesialisten
**Fokus:** React, TypeScript, komponentarkitektur  
**Oppgaver:**
- [ ] Analyser `frontend/src/pages/SearchPage.tsx` (hovedsiden)
- [ ] Analyser `frontend/src/components/search/` komponenter
- [ ] Sjekk state management (stores/)
- [ ] Identifiser duplisert kode, anti-patterns
- [ ] Vurder komponent-modularitet
- [ ] Sjekk API-integrasjon error handling

**Deliverable:** Rapport med kodekvalitet + refaktoreringsforslag

### 2. UX-spesialisten  
**Fokus:** Brukeropplevelse, flyt, konvertering
**Oppgaver:**
- [ ] Analyser søkeflyt (regnr → resultater)
- [ ] Vurder GlassPositionSelector brukervennlighet
- [ ] Sjekk BestMatchBanner design
- [ ] Analyser handlekurv/quote flow
- [ ] Identifiser "pain points" i brukerreisen
- [ ] Vurder mobiltilpasning

**Deliverable:** UX-analyse med forbedringsforslag

### 3. Performance-spesialisten
**Fokus:** Lighthouse, Core Web Vitals, lastetider
**Oppgaver:**
- [ ] Kjør Lighthouse CI hvis tilgjengelig
- [ ] Analyser bundle size (`dist/` eller `build/`)
- [ ] Sjekk lazy loading implementation
- [ ] Vurder API responstider (fra metrics)
- [ ] Identifiser render-blocking resources
- [ ] Sjekk bildeoptimalisering

**Deliverable:** Performance-rapport med tall

### 4. SEO-spesialisten
**Fokus:** Søkemotoroptimalisering, metadata, struktur
**Oppgaver:**
- [ ] Sjekk HTML `<title>` og `<meta>` tags
- [ ] Analyser `robots.txt` og `sitemap.xml`
- [ ] Vurder semantic HTML struktur
- [ ] Sjekk Open Graph / Twitter Cards
- [ ] Analyser URL-struktur
- [ ] Vurder Schema.org markup

**Deliverable:** SEO-sjekkliste med gap-analyse

---

## Kritiske Filer å Sjekke

```
frontend/
├── src/
│   ├── pages/
│   │   └── SearchPage.tsx          # Hovedside
│   ├── components/
│   │   ├── search/
│   │   │   ├── BestMatchBanner.tsx
│   │   │   ├── GlassPositionSelector.tsx
│   │   │   └── WindshieldVerifier.tsx
│   │   ├── catalog/
│   │   │   ├── ProductCard.tsx
│   │   │   ├── ProductDetail.tsx
│   │   │   └── ProductGrid.tsx
│   │   └── layout/
│   ├── stores/
│   │   ├── cartStore.ts
│   │   └── searchStore.ts
│   └── App.tsx
dist/ (eller build/)
public/
├── index.html
├── robots.txt
└── sitemap.xml
```

---

## Suksesskriterier

- **Frontend:** TypeScript strict compliance, ingen `any`, god komponent-modularitet
- **UX:** Klar CTA, forståelig flyt, mobilvennlig
- **Performance:** LCP <2.5s, CLS <0.1, FID <100ms
- **SEO:** 100% dekning av metadata, strukturert data

---

## Output Format

Hver spesialist rapporterer:
1. **Score:** 1-10 (hvor kritisk er funnene)
2. **Kritiske funn:** Liste med alvorlighetsgrad
3. **Anbefalinger:** Prioritert liste
4. **Quick wins:** Hva kan fikses raskt

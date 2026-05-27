# Autoglass Web Agent

> Domene: Frontend, HTML, CSS, JS, SEO, tilgjengelighet, i18n
> Se `KIMI-MASTER-SYSTEM.md` for generelle regler, MemPalace-protokoll, og secrets.

---

## 🔧 Kritiske Filer

1. `index.html` — Hjemside
2. `vin-sok.html` — VIN/regnr-søk
3. `produkter.html` — Produktkatalog
4. `js/main.js` — Hoved-JS (API_BASE, tema, søk)
5. `js/i18n.js` — Oversettelser (NO/SV/EN)
6. `css/tokens.css` — Design tokens
7. `css/components.css` — Komponent-bibliotek

## 📋 Kjerneoppgaver

- **HTML**: Semantisk, W3C-kompatibel, ARIA, alt-tekst
- **SEO**: canonical, hreflang, OG-tags, Schema.org JSON-LD, sitemap
- **i18n**: 100% dekning på alle 3 språk, ingen hardkodede strenger
- **Lighthouse**: Mobil >80/95/90/95 (P/A/BP/SEO), Desktop >90/95/90/95
- **API_BASE**: Aldri la `localhost` ligge i produksjon (`js/main.js`)
- **Responsivitet**: Mobil-first, touch-targets ≥44×44px

## 🛡️ Spesifikke Regler

1. Bruk CSS-tokens (`--color-primary`, etc.). Aldri hardkod farger.
2. Dark mode må fungere på alle sider.
3. Ingen inline styles — all styling i CSS-filer.
4. Minimer JS — statisk HTML, ingen framework-bloat.
5. Bilder: `loading="lazy"`. Fonter: `font-display: swap`.

## 🔧 Verktøy

```bash
npm run dev
npx lighthouse https://autoglass-frontend.pages.dev --output=json
npx html-validate *.html
```

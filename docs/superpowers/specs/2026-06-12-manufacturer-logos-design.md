# Design: Originale produsentlogoer på startsiden

## Bakgrunn
Seksjonen «Offisiell distributør av verdens ledende produsenter» på Autoglass-startsidens viser i dag fargetekst-badges i stedet for ekte logoer. Målet er å erstatte disse med originale, skarpe produsentlogoer i originale farger, samtidig som seksjonen beholdes ryddig og profesjonell på den mørke bakgrunnen.

## Mål
- Erstatte tekst-badges i `frontend/src/components/home/ManufacturerLogos.tsx` med bildelogoer.
- Beholde original merkefarge for hver produsent.
- Sikre god kontrast mot `bg-carbon-950` uten å ødelegge den mørke visuelle stilen.
- Bevare eksisterende responsiv oppførsel (desktop flex-wrap, mobil horisontal scroll).
- Sørge for fallback dersom en logo ikke lar seg skaffe eller en bildefil er ødelagt.

## Logo-ressurser og fallback

Logoer plasseres i `frontend/public/images/logos/` som SVG i utgangspunktet, med PNG som akseptabelt alternativ dersom vi kun finner raster.

| Produsent | Slug | Foretrukken kilde | Fallback-farge |
|---|---|---|---|
| Pilkington | `pilkington` | pilkington.com / NSG Group press-kit | `#003B7A` |
| Saint-Gobain Sekurit | `saint-gobain` | saint-gobain.com / Sekurit-brand | `#009639` |
| AGC Automotive | `agc` | agc-automotive.com | `#0055A4` |
| PGW Auto Glass | `pgw` | pgwautoglass.com | `#E31837` |
| Glavista | `glavista` | glavista.com | `#0047AB` |
| Fuyao | `fuyao` | fuyao.com | `#0066CC` |
| XYG | `xyg` | xinyiglass.com / companieslogo.com | `#0066CC` |
| NordGlass | `nordglass` | nordglass.eu | `#003366` (wordmark rendered in white) |
| Euroglass | `euroglass` | euroglass.pl | `#FF8C00` |

Fallback-strategi:
1. Prøv å hente offisiell SVG/PNG fra produsentens nettsted, press-kit eller Wikimedia Commons.
2. Dersom ingen offisiell fil er tilgjengelig, lag en ren SVG-wordmark med merkenavnet i fallback-fargen. For mørke/blå wordmarks mot den mørke bakgrunnen brukes en lys farge (f.eks. hvit) for å sikre kontrast.
3. PGW og Euroglass falt tilbake på egne wordmarks fordi offisielle logoer ikke var tilgjengelige.
4. I komponenten skjules ødelagte bilder automatisk og viser dagens badge som siste fallback.

## Visuell utforming

- **Bakgrunn**: beholdes `bg-carbon-950` med `border-y border-carbon-800`.
- **Farger**: logoene vises i originale farger (brukerens valg).
- **Størrelse**: maks-høyde økes til ca. `h-9`/`h-10` (36–40 px) med `w-auto object-contain`.
- **Kontrastløsning**: mørke/blå logoer (Pilkington, AGC, NordGlass) vil forsvinne mot mørk bakgrunn. Hver logo plasseres derfor i en subtil, halvtransparent «kortbakgrunn» (`bg-carbon-900/60` eller tilsvarende glass-effekt) med avrundede hjørner. Dette får fargene til å poppe uten å ødelegge den mørke stilen.
- **Layout**: samme desktop-rad med `flex-wrap` og jevn avstand (`gap-x-8 gap-y-4`), samt mobil horisontal scroll (`overflow-x-auto snap-x`).
- **Hover**: lett opplysning / skalering (`group-hover:scale-105`, `group-hover:brightness-110`).
- **Reduced motion**: hover-skalering slås av når brukeren har `prefers-reduced-motion: reduce`.

## Komponentendringer

### `frontend/src/components/home/ManufacturerLogos.tsx`

- Utvid `MANUFACTURERS`-array med `logo`-sti for alle produsenter, f.eks. `logo: '/images/logos/pilkington.svg'`.
- Oppdater `ManufacturerLogo` til å rendre `<img>` når `logo` finnes.
- Legg til `onError` på `<img>` som skjuler bildet og viser fallback-badge (abbr + navn).
- Behold `loading="lazy"` og `decoding="async"` for ytelse.
- Juster Tailwind-klasser for størrelse, mellomrom og kontrast-kort.

## Tilgjengelighet

- `alt={m.name}` på hver logo.
- Ingen kritisk informasjon kun i farge; produsentnavnet finnes i `alt` og `title`.
- Fallback-badge skal ha tilstrekkelig kontrast mot bakgrunn.

## Testing

- Oppdater `e2e/homepage-visual.spec.js` til å sjekke at logo-elementene er synlige i seksjonen.
- Kjør `npm run build` i `frontend` for å verifisere at alle logo-stier og import er gyldige.
- Kjør eksisterende homepage-a11y-tester for å sikre at kontrast og alt-tekst fortsatt holder.

## Uavklarte avhengigheter

- Om vi finner offisielle vektor-filer for alle ni produsenter avhenger av nettstedenes tilgjengelighet og eventuelt lisensbetingelser. Fallback-wordmarks dekker alle tilfeller.
- Endelig valg av kontrast-kort (nøyaktig Tailwind-klasse) kan justeres under implementasjon basert på hvordan logoene faktisk ser ut mot bakgrunnen.

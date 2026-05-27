# Hero Video

Plasser komprimert hero-loop her:

- `hero-loop.webm` — primær (WebM/VP9, 720p, 3–5s loop, <3 MB)
- `hero-loop.mp4` — fallback (H.264, 720p, 3–5s loop, <3 MB)

## Spesifikasjon

- **Tema:** Logistikk/lager/scanning (proft B2B) eller abstrakt glass/lys
- **Varighet:** 3–5 sekunder, seamless loop
- **Oppløsning:** 720p (1280×720)
- **Filstørrelse:** Maks 2–3 MB per fil
- **Fargepalett:** Mørk/muted, matcher carbon-950 + glass-cyan
- **Tempo:** Ingen hurtige kutt — B2B skal føles stabilt og pålitelig
- **Lyd:** Ingen (muted)

## Kilder

- Stock footage: Shutterstock, Artgrid, Storyblocks
- AI-generert: Runway Gen-3, Pika Labs, Kling
- Egen filming: krever stabilisering og fargegradering

Når video-filer er på plass, vil `HeroVideo`-komponenten automatisk oppdage og
vise dem. Inntil da vises en CSS-basert pseudo-video med animerte partikler,
scan-line og gradient-puls.

# MemPalace Plan Index: AI-first Europe-leading Autoglass Platform

Dato: 2026-06-09  
Full plan: `docs/superpowers/plans/2026-06-09-ai-first-europe-leading-platform.md`

## Sammendrag

Planen definerer hvordan Autoglass AS skal utvikle nettstedet fra B2B-katalog til AI-first bilglassplattform:

- Unified AI Search som primar inngang.
- Professor Autoglass som copilot, ikke maskot.
- Forklarbar matching med confidence, matchlag og reason codes.
- B2B-flyt med hurtigordre, quote drafts, lagerstatus og kundepris.
- Data-moat via ground truth, kType, kType Family, TecDoc, SVV, Bovsoft og fitment feedback.
- Europeisk skalerbarhet med sprak, market abstraction og partner/API-modul.

## MemPalace-kilder brukt

- `rooms/Docs/B2B-MODERN-FRONTEND-PLAN.md`
- `rooms/Knowledge/PROJECT_STATE.md`
- `rooms/Docs/TASK-8-BOVSOFT-STRATEGIC.md`
- `rooms/Knowledge/AGENTS.md`
- `data/diary.jsonl`

## Viktigste beslutning

AI skal ikke erstatte deterministic matching. LLM skal tolke, forklare, stille kontrollsporsmal og lage ordreutkast. Passform bestemmes av ground truth, kType, TecDoc, kType Family, D1-data og confidence-regler.

## Prioritert gjennomforing

1. Stabiliser Worker, CI og secrets.
2. Lanser AI-first startside med korrekte tall: 133 000 lagerglass og 27 000 varianter.
3. Bygg unified search for reg.nr, VIN, OEM, eurocode, SKU og fritekst.
4. Vis forklarbare resultater med confidence og matchgrunnlag.
5. Oppgrader Professor Autoglass til tool-calling copilot.
6. Bygg feedback/ground truth og B2B quote/ordre-flyt.

## Soketermer

AI-first, Professor Autoglass, unified search, B2B frontend, Europe leading, confidence UI, ground truth, kType Family, TecDoc, ordremottaker, 133000 glass, 27000 varianter.

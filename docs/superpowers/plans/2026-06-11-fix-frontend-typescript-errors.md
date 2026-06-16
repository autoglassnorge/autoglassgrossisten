# Fix Frontend TypeScript Build Errors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gjøre `frontend` TypeScript-bygget grønt (`npm run build` i `frontend/`) ved å fikse ubrukt kode, lazy-import-typer og useQuery-returtyper.

**Architecture:** Ingen arkitekturendring — kun typefikser og opprydding. Vi innfører en felles `IdentifierSearchResponse`-type i `api/glass.ts` og bruker eksplisitte `then((m) => ({ default: m.NamedExport }))`-mønstre for lazy imports av named exports.

**Tech Stack:** React, TypeScript, Vite, TanStack Query, React Router, Lucide React

---

## Task 1: Fjern ubrukt `navigate` i SupportSection

**Files:**
- Modify: `frontend/src/components/home/SupportSection.tsx:7`
- Modify: `frontend/src/components/home/SupportSection.tsx:17`

**Why:** `useNavigate` og `navigate` er importert/deklarert men aldri brukt. `tsc` feiler med `TS6133`.

- [ ] **Step 1: Fjern import av `useNavigate`**

```tsx
// Fjern denne linjen:
import { useNavigate } from 'react-router-dom';
```

- [ ] **Step 2: Fjern deklarasjon av `navigate`**

```tsx
// Fjern denne linjen:
const navigate = useNavigate();
```

- [ ] **Step 3: Verifiser at filen fremdeles er gyldig**

Run: `cd frontend && npx tsc --noEmit src/components/home/SupportSection.tsx`
Expected: Ingen feil relatert til SupportSection.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/home/SupportSection.tsx
git commit -m "fix(frontend): remove unused navigate in SupportSection"
```

---

## Task 2: Fjern ubrukte Lucide-imports og fiks lazy-import-typer i SearchPage

**Files:**
- Modify: `frontend/src/pages/SearchPage.tsx:3`
- Modify: `frontend/src/pages/SearchPage.tsx:23-25`

**Why:**
- `Wrench` og `AlertTriangle` importeres men brukes ikke (`TS6133`).
- `lazy(() => import('@/components/search/results/RegnrResults'))` forventer at modulen har en `default export`. Komponentene bruker named exports, så TypeScript klager på `Property 'default' is missing` (`TS2322`). Løsningen er samme mønster som allerede brukes for `VehicleWizard` og `ProductDetail`: `import(...).then((m) => ({ default: m.NamedExport }))`.

- [ ] **Step 1: Fjern ubrukte imports fra lucide-react**

```tsx
// Fra:
import { Loader2, Car, Wrench, X, AlertTriangle } from 'lucide-react';

// Til:
import { Loader2, Car, X } from 'lucide-react';
```

- [ ] **Step 2: Oppdater lazy imports til named export-mønster**

```tsx
const RegnrResults = lazy(() =>
  import('@/components/search/results/RegnrResults').then((m) => ({ default: m.RegnrResults }))
);
const IdentifierResults = lazy(() =>
  import('@/components/search/results/IdentifierResults').then((m) => ({ default: m.IdentifierResults }))
);
const CatalogResults = lazy(() =>
  import('@/components/search/results/CatalogResults').then((m) => ({ default: m.CatalogResults }))
);
```

- [ ] **Step 3: Verifiser SearchPage alene**

Run: `cd frontend && npx tsc --noEmit src/pages/SearchPage.tsx`
Expected: Ingen feil relatert til SearchPage.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/SearchPage.tsx
git commit -m "fix(frontend): clean unused imports and fix lazy import types in SearchPage"
```

---

## Task 3: Definer felles returtype for identifier-søk i glass.ts

**Files:**
- Modify: `frontend/src/api/glass.ts:62,71,80`

**Why:** `searchByEurocode`, `searchBySku` og `searchByOem` returnerer ulike `query`-objekter (`{ eurocode: string }`, `{ supplier_sku: string }`, `{ oem: string }`). Når de kombineres i en dynamisk `queryFn` i `IdentifierResults.tsx`, klarer ikke TypeScript å utlede en felles type. Resultatet blir `query.data: {}`, og `data.count` / `data.results` finnes ikke (`TS2339`).

- [ ] **Step 1: Legg til felles interface før funksjonene**

```ts
export interface IdentifierSearchResponse {
  query: Record<string, string>;
  count: number;
  results: unknown[];
}
```

Plassering: rett før `searchByEurocode` (ca. linje 61 i `frontend/src/api/glass.ts`).

- [ ] **Step 2: Oppdater returtypene på de tre funksjonene**

```ts
export async function searchByEurocode(eurocode: string): Promise<IdentifierSearchResponse> {
  // ... eksisterende kode ...
}

export async function searchBySku(sku: string): Promise<IdentifierSearchResponse> {
  // ... eksisterende kode ...
}

export async function searchByOem(oem: string): Promise<IdentifierSearchResponse> {
  // ... eksisterende kode ...
}
```

- [ ] **Step 3: Verifiser api/glass.ts**

Run: `cd frontend && npx tsc --noEmit src/api/glass.ts`
Expected: Ingen feil.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/glass.ts
git commit -m "fix(frontend): add shared IdentifierSearchResponse type"
```

---

## Task 4: Fjern unødvendig type-cast i IdentifierResults

**Files:**
- Modify: `frontend/src/components/search/results/IdentifierResults.tsx:31-33`

**Why:** Når `glass.ts` returnerer `IdentifierSearchResponse`, vil `useQuery` automatisk utlede `query.data` som `IdentifierSearchResponse | undefined`. Da trengs ikke lenger `as Product[]`-casten på linje 33; vi kan bruke `unknown[]` eller type-garde produktene. For å minimere endringer beholdes casten, men nå gjøres den på en tryggere måte med riktig underliggende type.

- [ ] **Step 1: Forenkle data-uthenting**

```tsx
const data = query.data;
const count = data?.count ?? 0;
const results = (data?.results as Product[]) ?? [];
```

Denne koden er identisk med dagens, men vil nå type-sjekke korrekt fordi `data` er `IdentifierSearchResponse | undefined` i stedet for `{} | undefined`.

- [ ] **Step 2: Verifiser IdentifierResults alene**

Run: `cd frontend && npx tsc --noEmit src/components/search/results/IdentifierResults.tsx`
Expected: Ingen feil.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/search/results/IdentifierResults.tsx
git commit -m "fix(frontend): rely on shared IdentifierSearchResponse type"
```

---

## Task 5: Full byggverifisering

**Files:**
- Test: hele `frontend/`-prosjektet

- [ ] **Step 1: Kjør full TypeScript + Vite-bygg**

Run:
```bash
cd frontend
npm run build
```

Expected: `tsc && vite build` fullfører med exit code 0.

- [ ] **Step 2: Hvis nye feil dukker opp, fiks dem på samme måte**

For hver ny `TS6xxx`-feil:
- Slett ubrukte imports/variabler.
- Fiks lazy imports av named exports.
- Bruk eksplisitte returtyper der union-typer forvirrer `useQuery`.

- [ ] **Step 3: Commit når bygget er grønt**

```bash
git add -A
git commit -m "fix(frontend): resolve TypeScript build errors"
```

---

## Task 6: Push, PR og merge

- [ ] **Step 1: Push branch**

```bash
git push -u origin fix/frontend-typescript-errors
```

- [ ] **Step 2: Opprett PR**

Tittel: `fix(frontend): resolve TypeScript build errors`

Body:
```markdown
## Hva
Fikser pre-eksisterende TypeScript-feil som blokkerte frontend-bygg og deploy.

## Endringer
- Fjernet ubrukte imports/variabler i `SupportSection.tsx` og `SearchPage.tsx`.
- Fikset lazy import-typer for named exports i `SearchPage.tsx`.
- Innførte `IdentifierSearchResponse` i `api/glass.ts` for felles returtype.
- `IdentifierResults.tsx` bruker nå den delte typen fra `useQuery`.

## Verifisering
- `npm run build` i `frontend/` kjører grønt.
```

- [ ] **Step 3: Merge PR**

```bash
gh pr merge <nummer> --merge --subject "fix(frontend): resolve TypeScript build errors"
```

- [ ] **Step 4: Overvåk deploy**

Run: `gh run list --workflow=deploy.yml --limit 5`
Expected: Ny deploy med temaet "fix(frontend): resolve TypeScript build errors" går til success.

---

## Risiko og avhengigheter

- **Lav risiko:** Kun type- og oppryddingsendringer; ingen logikk endres.
- **Avhengigheter:** Ingen. Endringene er isolert til frontend/src.
- **Kjent caveat:** Hvis andre filer har lignende lazy-import-problemer, kan nye feil dukke opp under fullt bygg. Disse fikses i Task 5.

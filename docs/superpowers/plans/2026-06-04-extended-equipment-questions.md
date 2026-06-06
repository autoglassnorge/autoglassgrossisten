# Utvidede Equipment-Spørsmål for AI Ordremottaker

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Utvide AI Ordremottaker med 8 equipment-spørsmål (ADAS → LDW → Varme + oppfølging → HUD → Antenne → Coated → Regnsensor → Akustisk) for å redusere feilbestillinger.

**Architecture:** Backend-funksjoner `buildEquipmentQuestion`, `filterByEquipment`, `hasVariation` utvides med nye felter. Session lagrer svar som `Record<string, string>` (eksisterende struktur). Oppfølgingspørsmål for varme-type håndteres via `pending_question` + `candidate_data`. Frontend trenger ingen endringer — spørsmål vises automatisk via status `question`.

**Tech Stack:** Cloudflare Worker (TypeScript), D1 SQLite, KV sessions, React + Tailwind frontend.

---

## File Structure

| File | Responsibility |
|------|--------------|
| `api/cf-worker/src/handlers/ordremottaker.ts` | Equipment-spørsmållogikk, filtrering, accessories |
| `api/cf-worker/src/lib/ordremottaker-session.ts` | Session storage (answers: Record<string, string>) |

---

## Task 1: Utvid `hasVariation` til å støtte nye felter + heated-type variasjon

**Files:**
- Modify: `api/cf-worker/src/handlers/ordremottaker.ts:67-76`

**Context:** Dagens `hasVariation` sjekker kun `adas`, `rainSensor`, `heated`, `acoustic`. Vi trenger `ldw`, `hud`, `antenna`, `coated` pluss virtuelt felt `heated_type`.

**Heated-type deteksjon:** Et glass har "full varme" hvis `heated=1` og `camera=0`. Et glass har "kamera-varme" hvis `heated=1` og `camera=1`. Variasjon finnes hvis begge typer finnes blant kandidater med `heated=1`.

- [ ] **Step 1: Skriv den nye `hasVariation`**

```typescript
/** Sjekk om kandidater har variasjon i et gitt equipment-felt */
function hasVariation(candidates: any[], field: 'adas' | 'ldw' | 'rainSensor' | 'heated' | 'heated_type' | 'hud' | 'antenna' | 'coated' | 'acoustic'): boolean {
  const values = new Set<string>();
  for (const c of candidates) {
    let val: string;
    if (field === 'heated_type') {
      // Kun relevant for kandidater med heated=1
      if (!getProp(c, 'heated')) continue;
      const hasCameraHeat = !!getProp(c, 'camera');
      val = hasCameraHeat ? 'camera' : 'full';
    } else if (field === 'ldw') {
      val = String(!!(getProp(c, 'lane_assist') || getProp(c, 'adas')));
    } else {
      val = String(!!getProp(c, field));
    }
    values.add(val);
    if (values.size > 1) return true;
  }
  return values.size > 1;
}
```

- [ ] **Step 2: Verifiser at `getProp` leser fra properties**

`getProp` finnes allerede på linje 62-65. Den leser fra `c.properties`.

- [ ] **Step 3: Commit**

```bash
git add api/cf-worker/src/handlers/ordremottaker.ts
git commit -m "feat(ordremottaker): extend hasVariation for ldw, hud, antenna, coated, heated_type"
```

---

## Task 2: Utvid `filterByEquipment` med nye felter + heated-type

**Files:**
- Modify: `api/cf-worker/src/handlers/ordremottaker.ts:78-85`

- [ ] **Step 1: Skriv den nye `filterByEquipment`**

```typescript
/** Filtrer kandidater basert på equipment-svar */
function filterByEquipment(candidates: any[], answers: Record<string, string>): any[] {
  return candidates.filter((c) => {
    for (const [field, answer] of Object.entries(answers)) {
      if (field === 'heated_type') {
        // Kun relevant hvis heated=1
        if (!getProp(c, 'heated')) continue;
        const hasCameraHeat = !!getProp(c, 'camera');
        const type = hasCameraHeat ? 'camera' : 'full';
        if (type !== answer) return false;
      } else if (field === 'ldw') {
        const hasLdw = !!(getProp(c, 'lane_assist') || getProp(c, 'adas'));
        if (String(hasLdw) !== answer) return false;
      } else if (
        field === 'adas' || field === 'rainSensor' || field === 'heated' ||
        field === 'hud' || field === 'antenna' || field === 'coated' || field === 'acoustic'
      ) {
        if (String(!!getProp(c, field)) !== answer) return false;
      }
    }
    return true;
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add api/cf-worker/src/handlers/ordremottaker.ts
git commit -m "feat(ordremottaker): extend filterByEquipment with ldw, hud, antenna, coated, heated_type"
```

---

## Task 3: Utvid `buildEquipmentQuestion` med 8 felter + oppfølgingspørsmål

**Files:**
- Modify: `api/cf-worker/src/handlers/ordremottaker.ts:86-122`

**Context:** Nye spørsmål i prioritet:
1. ADAS-kamera (trafikkskilt/adaptive cruise)
2. LDW/Lane Assist (filholderassistent)
3. Varme (oppvarmet frontrute)
4. Varme-type (full vs kamera-sone) — OPPFØLGING etter ja på varme
5. HUD (Head-Up Display)
6. Antenne (i frontruten)
7. Coated/Solar (varmereflekterende)
8. Regnsensor
9. Akustisk

Posisjonsbasert: Bakrute får kun spørsmål om varme, regnsensor, akustisk (ikke ADAS/LDW/HUD/antenne/coated).

- [ ] **Step 1: Skriv den nye `buildEquipmentQuestion`**

```typescript
interface EquipmentQuestion {
  field: string;
  question: string;
  nextAction: string;
}

/** Bygg spørsmål for neste equipment-variasjon */
function buildEquipmentQuestion(
  candidates: any[],
  answers: Record<string, string>,
  position: string
): EquipmentQuestion | null {
  const isFront = position === 'frontrute' || position === 'glass';

  // Oppfølging: heated_type etter at bruker svarte ja på heated
  if (answers['heated'] === 'true' && !answers['heated_type']) {
    if (hasVariation(candidates, 'heated_type')) {
      return {
        field: 'heated_type',
        question: 'Er det full varme i hele frontruten, eller bare en varmesone foran kameraet?',
        nextAction: 'ask_heated_type',
      };
    }
  }

  const frontQuestions: EquipmentQuestion[] = [
    { field: 'adas', question: 'Har bilen frontkamera for trafikkskilt eller adaptive cruise control?', nextAction: 'ask_adas' },
    { field: 'ldw', question: 'Har bilen filholderassistent (lane assist / LDW)?', nextAction: 'ask_ldw' },
    { field: 'heated', question: `Har bilen oppvarmet ${isFront ? 'frontrute' : position}?`, nextAction: 'ask_heated' },
    { field: 'hud', question: 'Har bilen Head-Up Display (HUD) som viser informasjon i frontruten?', nextAction: 'ask_hud' },
    { field: 'antenna', question: 'Har bilen antenne integrert i frontruten?', nextAction: 'ask_antenna' },
    { field: 'coated', question: 'Har bilen coated / solar glass (varmereflekterende) i frontruten?', nextAction: 'ask_coated' },
    { field: 'rainSensor', question: 'Har bilen regnsensor?', nextAction: 'ask_rain_sensor' },
    { field: 'acoustic', question: `Ønsker du akustisk (støydempet) ${isFront ? 'frontrute' : position}?`, nextAction: 'ask_acoustic' },
  ];

  const backQuestions: EquipmentQuestion[] = [
    { field: 'heated', question: 'Har bilen oppvarmet bakrute?', nextAction: 'ask_heated' },
    { field: 'rainSensor', question: 'Har bilen regnsensor?', nextAction: 'ask_rain_sensor' },
    { field: 'acoustic', question: 'Ønsker du akustisk (støydempet) bakrute?', nextAction: 'ask_acoustic' },
  ];

  const questions = isFront ? frontQuestions : backQuestions;

  for (const item of questions) {
    if (answers[item.field] !== undefined) continue;
    if (hasVariation(candidates, item.field as any)) {
      return item;
    }
  }
  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add api/cf-worker/src/handlers/ordremottaker.ts
git commit -m "feat(ordremottaker): 8 equipment questions with follow-up for heated_type"
```

---

## Task 4: Oppdater `parseBooleanAnswer` + legg til `parseHeatedTypeAnswer`

**Files:**
- Modify: `api/cf-worker/src/handlers/ordremottaker.ts`

- [ ] **Step 1: Legg til parser for heated_type**

```typescript
/** Parse varme-type svar fra bruker */
function parseHeatedTypeAnswer(message: string): 'full' | 'camera' | null {
  const lower = message.toLowerCase().trim();
  if (lower.includes('full') || lower.includes('hele') || lower.includes('alt') || lower === 'f') return 'full';
  if (lower.includes('kamera') || lower.includes('cam') || lower.includes('bare') || lower === 'c') return 'camera';
  return null;
}
```

- [ ] **Step 2: Oppdater pending_question-håndtering for å bruke riktig parser**

I `handleOrdremottaker`, der `session.pending_question` håndteres (ca. linje 132):

```typescript
// ── A: Handle pending equipment question ──
if (session.pending_question) {
  let answer: string | null = null;
  
  if (session.pending_question === 'heated_type') {
    answer = parseHeatedTypeAnswer(body.message);
  } else {
    const boolAnswer = parseBooleanAnswer(body.message);
    if (boolAnswer !== null) answer = String(boolAnswer);
  }
  
  if (answer !== null) {
    equipmentAnswers = { ...(session.answers || {}) };
    equipmentAnswers[session.pending_question] = answer;
    // ... resten av logikken uendret
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add api/cf-worker/src/handlers/ordremottaker.ts
git commit -m "feat(ordremottaker): add heated_type parser and use correct parser per question type"
```

---

## Task 5: Utvid `buildAccessories` med utstyrsspesifikke tilbehør

**Files:**
- Modify: `api/cf-worker/src/handlers/ordremottaker.ts`

- [ ] **Step 1: Utvid `buildAccessories` signatur og logikk**

```typescript
function buildAccessories(
  position: string | null,
  equipment: {
    hasAdas: boolean;
    hasLdw: boolean;
    isHeated: boolean;
    heatedType: string | null;
    hasHud: boolean;
    hasAntenna: boolean;
    isCoated: boolean;
  }
): AccessoryItem[] {
  const accessories: AccessoryItem[] = [];
  const isFront = position === 'frontrute' || position === 'glass';

  if (position === 'bakrute') {
    accessories.push({ sku: 'LIM-STD', name: 'Lim', price: 189, included: true, removable: false, category: 'required' });
    accessories.push({ sku: 'KLIPS-STD', name: 'Klips', price: 89, included: true, removable: true, category: 'required' });
  } else if (position === 'dørrute' || position === 'siderute') {
    accessories.push({ sku: 'KLIPS-STD', name: 'Klips', price: 89, included: true, removable: true, category: 'required' });
    accessories.push({ sku: 'TETNING-STD', name: 'Tetningslist', price: 145, included: true, removable: false, category: 'required' });
  } else {
    // Default = frontrute
    accessories.push({ sku: 'LIST-STD', name: 'Pyntelist', price: 245, included: true, removable: false, category: 'required' });
    accessories.push({ sku: 'LIM-STD', name: 'Lim', price: 189, included: true, removable: false, category: 'required' });
    accessories.push({ sku: 'KLIPS-STD', name: 'Klips', price: 89, included: true, removable: true, category: 'required' });
  }

  if (isFront) {
    if (equipment.hasAdas || equipment.hasLdw) {
      accessories.push({
        sku: 'ADAS-WARN',
        name: 'ADAS-kalibrering',
        price: 0,
        included: false,
        removable: false,
        category: 'warning',
        notes: 'Kalibrering av førerassistentsystemer kreves etter montering av frontrute med kamera/sensor',
      });
    }

    if (equipment.isHeated) {
      if (equipment.heatedType === 'camera') {
        accessories.push({
          sku: 'LIM-HEAT-CAM',
          name: 'Spesial-lim (kamera-varme)',
          price: 199,
          included: true,
          removable: true,
          category: 'recommended',
          notes: 'Anbefalt for frontrute med kamera-varmesone — sikrer riktig ledningsevne',
        });
      } else {
        accessories.push({
          sku: 'LIM-HEAT',
          name: 'Spesial-lim (varmebestandig)',
          price: 249,
          included: true,
          removable: true,
          category: 'recommended',
          notes: 'Anbefalt for oppvarmet glass — tåler høyere temperaturer',
        });
      }
    }

    if (equipment.hasHud) {
      accessories.push({
        sku: 'HUD-WARN',
        name: 'HUD-spesialfrontrute',
        price: 0,
        included: false,
        removable: false,
        category: 'warning',
        notes: 'HUD krever spesiell coating på frontruten — sørg for at riktig glass velges',
      });
    }

    if (equipment.hasAntenna) {
      accessories.push({
        sku: 'ANT-WARN',
        name: 'Antenne-integrert glass',
        price: 0,
        included: false,
        removable: false,
        category: 'warning',
        notes: 'Bilen har antenne integrert i frontruten — sørg for at tilkobling overføres',
      });
    }
  }

  return accessories;
}
```

- [ ] **Step 2: Oppdater kallet til `buildAccessories`**

Erstatt dagens kall:

```typescript
// Build position-based accessories
const pos = nerResult?.position || extractPositionFromMessage(body.message);
const hasAdas = candidates.some((c: any) => !!getProp(c, 'adas')) || equipmentAnswers['adas'] === 'true';
const hasLdw = candidates.some((c: any) => !!(getProp(c, 'lane_assist') || getProp(c, 'adas'))) || equipmentAnswers['ldw'] === 'true';
const isHeated = candidates.some((c: any) => !!getProp(c, 'heated')) || equipmentAnswers['heated'] === 'true';
const heatedType = equipmentAnswers['heated_type'] || null;
const hasHud = candidates.some((c: any) => !!getProp(c, 'hud')) || equipmentAnswers['hud'] === 'true';
const hasAntenna = candidates.some((c: any) => !!getProp(c, 'antenna')) || equipmentAnswers['antenna'] === 'true';
const isCoated = candidates.some((c: any) => !!getProp(c, 'coated')) || equipmentAnswers['coated'] === 'true';

const accessories = buildAccessories(pos, {
  hasAdas,
  hasLdw,
  isHeated,
  heatedType,
  hasHud,
  hasAntenna,
  isCoated,
});
```

- [ ] **Step 3: Commit**

```bash
git add api/cf-worker/src/handlers/ordremottaker.ts
git commit -m "feat(ordremottaker): extend buildAccessories with ADAS, LDW, HUD, antenna, heated_type"
```

---

## Task 6: Oppdater `pending_question` mapping for nye felter

**Files:**
- Modify: `api/cf-worker/src/handlers/ordremottaker.ts`

Dagens mapping (ca. linje 373-376):

```typescript
const pendingQuestionField = nextAction?.startsWith('ask_')
  ? (nextAction.replace('ask_', '') === 'rain_sensor' ? 'rainSensor' : nextAction.replace('ask_', ''))
  : null;
```

- [ ] **Step 1: Erstatt med robust mapping**

```typescript
const pendingQuestionField = nextAction?.startsWith('ask_')
  ? ({
      ask_adas: 'adas',
      ask_ldw: 'ldw',
      ask_heated: 'heated',
      ask_heated_type: 'heated_type',
      ask_hud: 'hud',
      ask_antenna: 'antenna',
      ask_coated: 'coated',
      ask_rain_sensor: 'rainSensor',
      ask_acoustic: 'acoustic',
    }[nextAction] || null)
  : null;
```

- [ ] **Step 2: Commit**

```bash
git add api/cf-worker/src/handlers/ordremottaker.ts
git commit -m "refactor(ordremottaker): robust pending_question mapping for all equipment fields"
```

---

## Task 7: Test lokalt med wrangler dev

**Files:**
- Test via: `curl` mot `http://localhost:8787/api/ordremottaker`

- [ ] **Step 1: Start lokal dev server**

```bash
cd api/cf-worker && npx wrangler dev --local
```

- [ ] **Step 2: Test spørsmål-rekkefølge**

```bash
curl -s -X POST http://localhost:8787/api/ordremottaker \
  -H 'Content-Type: application/json' \
  -d '{"message":"VW Golf 2020 frontrute"}'
```

Forventet: Første spørsmål om ADAS-kamera (hvis det er variasjon).

- [ ] **Step 3: Test oppfølgingspørsmål for varme-type**

Svar "ja" på varme-spørsmålet, deretter sjekk at neste spørsmål er "full varme eller kamera?".

- [ ] **Step 4: Test bakrute (færre spørsmål)**

```bash
curl -s -X POST http://localhost:8787/api/ordremottaker \
  -H 'Content-Type: application/json' \
  -d '{"message":"VW Golf 2020 bakrute"}'
```

Forventet: Ikke spørsmål om ADAS, LDW, HUD, antenna, coated.

- [ ] **Step 5: Commit testresultater**

```bash
git add .
git commit -m "test(ordremottaker): verify extended equipment questions locally"
```

---

## Task 8: Deploy til produksjon

- [ ] **Step 1: Deploy Worker**

```bash
cd api/cf-worker && npx wrangler deploy
```

- [ ] **Step 2: Smoke-test i produksjon**

```bash
curl -s -X POST https://autoglass-glass-sok.autoglassnorge.workers.dev/api/ordremottaker \
  -H 'Content-Type: application/json' \
  -d '{"message":"Volvo XC60 2018 frontrute"}' | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f\"Status: {data['status']}\")
print(f\"AI: {data['ai_response']}\")
print(f\"Next action: {data.get('next_action', 'none')}\")
"
```

- [ ] **Step 3: Commit deploy-marker**

```bash
git add . && git commit -m "deploy(ordremottaker): extended equipment questions to production"
```

---

## Self-Review Checklist

### Spec Coverage
- [x] ADAS-kamera spørsmål → Task 3
- [x] LDW/Lane Assist spørsmål → Task 3
- [x] Varme spørsmål → Task 3
- [x] Varme-type oppfølging → Task 3, 4
- [x] HUD spørsmål → Task 3, 5
- [x] Antenne spørsmål → Task 3, 5
- [x] Coated/Solar spørsmål → Task 3
- [x] Regnsensor spørsmål → Task 3 (eksisterende)
- [x] Akustisk spørsmål → Task 3 (eksisterende)
- [x] Posisjonsbaserte spørsmål (bakrute får færre) → Task 3
- [x] buildAccessories utvidet → Task 5

### Placeholder Scan
- [x] Ingen "TBD", "TODO", "implement later"
- [x] Ingen vage beskrivelser uten kode
- [x] Alle typer og feltnavn er konsistente gjennom alle tasks

### Type Consistency
- [x] `hasVariation` field-param: `'adas' | 'ldw' | 'rainSensor' | 'heated' | 'heated_type' | 'hud' | 'antenna' | 'coated' | 'acoustic'`
- [x] `equipmentAnswers` er `Record<string, string>` — heated_type lagres som `'full'` eller `'camera'`
- [x] `pending_question` mapping bruker samme feltnavn som answers
- [x] `buildAccessories` equipment-param matcher equipmentAnswers-nøkler

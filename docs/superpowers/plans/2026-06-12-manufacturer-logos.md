# Manufacturer Logos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the text badges in the homepage manufacturer section with real logo images while keeping the dark, professional look and preserving fallback behaviour.

**Architecture:** Keep the existing `ManufacturerLogos` component structure but populate the `MANUFACTURERS` array with `logo` paths pointing to files in `frontend/public/images/logos/`. Add an `onError` image fallback to the previous badge and wrap each logo in a subtle contrast card so original colours remain readable on `bg-carbon-950`. Tests verify visibility and build sanity.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vite, Playwright, Vitest.

---

## File structure

- **Create:** `frontend/public/images/logos/` — directory for logo assets.
- **Create:** `frontend/public/images/logos/pilkington.png` — Pilkington logo.
- **Create:** `frontend/public/images/logos/saint-gobain.svg` — Saint-Gobain logo.
- **Create:** `frontend/public/images/logos/agc.svg` — AGC logo.
- **Create:** `frontend/public/images/logos/pgw.jpg` — PGW logo.
- **Create:** `frontend/public/images/logos/glavista.svg` — Glavista logo.
- **Create:** `frontend/public/images/logos/fuyao.png` — Fuyao logo.
- **Create:** `frontend/public/images/logos/xyg.png` — XYG logo.
- **Create:** `frontend/public/images/logos/nordglass.svg` — NordGlass fallback wordmark.
- **Create:** `frontend/public/images/logos/euroglass.png` — Euroglass logo.
- **Modify:** `frontend/src/components/home/ManufacturerLogos.tsx` — use logos, add fallback, update styling.
- **Modify:** `e2e/homepage-visual.spec.js` — add visibility assertion for manufacturer logos.
- **Modify:** `e2e/homepage-a11y.spec.js` — add assertion that every logo image has a non-empty `alt`.

---

### Task 1: Create logo asset directory

**Files:**
- Create directory: `frontend/public/images/logos/`

- [ ] **Step 1: Create the directory**

Run:
```bash
mkdir -p /Users/taj/bilglass/frontend/public/images/logos
```

- [ ] **Step 2: Commit the directory placeholder**

Run:
```bash
cd /Users/taj/bilglass
git add frontend/public/images/logos
git commit -m "chore: add manufacturer logos directory"
```

---

### Task 2: Download known official logos

**Files:**
- Create: `frontend/public/images/logos/pilkington.png`
- Create: `frontend/public/images/logos/saint-gobain.svg`
- Create: `frontend/public/images/logos/agc.svg`
- Create: `frontend/public/images/logos/pgw.jpg`
- Create: `frontend/public/images/logos/glavista.svg`
- Create: `frontend/public/images/logos/fuyao.png`
- Create: `frontend/public/images/logos/xyg.png`
- Create: `frontend/public/images/logos/euroglass.png`

- [ ] **Step 1: Download the logo files**

Run from `/Users/taj/bilglass`:
```bash
cd frontend/public/images/logos
curl -sL -o pilkington.png "https://www.pilkington.com/_externalBuilds/NSG.WCM.Pilkington.Core/css/img/rsz_pilkington_logo.png"
curl -sL -o saint-gobain.svg "https://upload.wikimedia.org/wikipedia/en/d/dc/Saint-Gobain_logo.svg"
curl -sL -o agc.svg "https://www.agc-automotive.com/static/image/base/agc_logo.svg"
curl -sL -o pgw.jpg "https://autoglassweek.com/wp-content/uploads/2026/02/PGW_EAG_extra_compact_Color-Copy.jpg"
curl -sL -o glavista.svg "https://www.glavista.com/img/personalizacion/guardian/base/logo-glavista-blanco.svg"
curl -sL -o fuyao.png "https://upload.wikimedia.org/wikipedia/en/3/35/Fuyao_Logo.png"
curl -sL -o xyg.png "https://autoglassweek.com/wp-content/uploads/2026/01/XYG-2023-scaled.png"
curl -sL -o euroglass.png "https://am-assets.pl/themes/light/img/logo/pl_desktop.png"
```

- [ ] **Step 2: Verify files are non-empty**

Run:
```bash
ls -la /Users/taj/bilglass/frontend/public/images/logos/
```
Expected: each file above has size > 0 bytes.

- [ ] **Step 3: Commit the downloaded logos**

Run:
```bash
cd /Users/taj/bilglass
git add frontend/public/images/logos/pilkington.png frontend/public/images/logos/saint-gobain.svg frontend/public/images/logos/agc.svg frontend/public/images/logos/pgw.jpg frontend/public/images/logos/glavista.svg frontend/public/images/logos/fuyao.png frontend/public/images/logos/xyg.png frontend/public/images/logos/euroglass.png
git commit -m "feat: add official manufacturer logo assets"
```

---

### Task 3: Create fallback SVG wordmark for NordGlass

**Files:**
- Create: `frontend/public/images/logos/nordglass.svg`

- [ ] **Step 1: Write the fallback SVG**

Create `frontend/public/images/logos/nordglass.svg` with:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40" width="200" height="40">
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold"
        fill="#003366">NordGlass</text>
</svg>
```

- [ ] **Step 2: Commit the fallback logo**

Run:
```bash
cd /Users/taj/bilglass
git add frontend/public/images/logos/nordglass.svg
git commit -m "feat: add NordGlass fallback wordmark"
```

---

### Task 4: Update ManufacturerLogos component

**Files:**
- Modify: `frontend/src/components/home/ManufacturerLogos.tsx`

- [ ] **Step 1: Replace the component content**

Write the full file `frontend/src/components/home/ManufacturerLogos.tsx`:
```tsx
/**
 * ManufacturerLogos — Logo grid of glass manufacturers.
 * Supports both image files (SVG/PNG/JPG) and styled text fallback.
 * Place logo files in /public/images/logos/ and update MANUFACTURERS below.
 */

import { useRef, useState } from 'react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

interface Manufacturer {
  name: string;
  abbr: string;
  logo: string; // path in /public/images/logos/
  color: string; // brand color for fallback text
}

const MANUFACTURERS: Manufacturer[] = [
  { name: 'Pilkington', abbr: 'PLK', logo: '/images/logos/pilkington.png', color: '#003B7A' },
  { name: 'Saint-Gobain Sekurit', abbr: 'SGS', logo: '/images/logos/saint-gobain.svg', color: '#009639' },
  { name: 'AGC Automotive', abbr: 'AGC', logo: '/images/logos/agc.svg', color: '#0055A4' },
  { name: 'PGW Auto Glass', abbr: 'PGW', logo: '/images/logos/pgw.jpg', color: '#E31837' },
  { name: 'Glavista', abbr: 'GLA', logo: '/images/logos/glavista.svg', color: '#0047AB' },
  { name: 'Fuyao', abbr: 'FUY', logo: '/images/logos/fuyao.png', color: '#CC0000' },
  { name: 'XYG', abbr: 'XYG', logo: '/images/logos/xyg.png', color: '#0066CC' },
  { name: 'NordGlass', abbr: 'NGL', logo: '/images/logos/nordglass.svg', color: '#003366' },
  { name: 'Euroglass', abbr: 'EUG', logo: '/images/logos/euroglass.png', color: '#FF8C00' },
];

function ManufacturerLogo({ m }: { m: Manufacturer }) {
  const [failed, setFailed] = useState(false);

  // If the image failed to load, fall back to the styled text badge.
  if (failed) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded text-white"
          style={{ backgroundColor: m.color }}
        >
          {m.abbr}
        </span>
        <span className="text-base font-semibold text-carbon-500 group-hover:text-white transition-colors tracking-wide">
          {m.name}
        </span>
      </div>
    );
  }

  return (
    <img
      src={m.logo}
      alt={m.name}
      className="h-9 w-auto object-contain transition motion-safe:group-hover:scale-105 motion-safe:group-hover:brightness-110"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function ManufacturerLogos() {
  const sectionRef = useRef<HTMLElement>(null);
  const isVisible = useScrollReveal(sectionRef);

  return (
    <section
      ref={sectionRef}
      className={`bg-carbon-950 border-y border-carbon-800 py-8 overflow-hidden scroll-reveal ${isVisible ? 'is-visible' : ''}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-[11px] text-carbon-500 uppercase tracking-[0.15em] mb-5">
          Offisiell distributør av verdens ledende produsenter
        </p>

        {/* Desktop: wrap grid */}
        <div className="hidden sm:flex items-center justify-center flex-wrap gap-x-8 gap-y-4">
          {MANUFACTURERS.map((m) => (
            <div
              key={m.name}
              className="group flex items-center justify-center px-4 py-2 rounded-lg bg-carbon-900/60 hover:bg-carbon-800/80 transition cursor-default"
              title={m.name}
            >
              <ManufacturerLogo m={m} />
            </div>
          ))}
        </div>

        {/* Mobile: horizontal scroll */}
        <div className="sm:hidden flex overflow-x-auto snap-x snap-mandatory gap-4 pb-2 -mx-4 px-4 scrollbar-hide">
          {MANUFACTURERS.map((m) => (
            <div
              key={m.name}
              className="flex-shrink-0 snap-start flex items-center justify-center px-4 py-2 rounded-lg bg-carbon-900/60"
              title={m.name}
            >
              <ManufacturerLogo m={m} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type-check the component**

Run:
```bash
cd /Users/taj/bilglass/frontend
npx tsc --noEmit
```
Expected: no TypeScript errors.

- [ ] **Step 3: Commit the component changes**

Run:
```bash
cd /Users/taj/bilglass
git add frontend/src/components/home/ManufacturerLogos.tsx
git commit -m "feat: render manufacturer logos with fallback and contrast cards"
```

---

### Task 5: Update visual test for manufacturer logos

**Files:**
- Modify: `e2e/homepage-visual.spec.js`

- [ ] **Step 1: Add logo visibility checks**

Replace the contents of `e2e/homepage-visual.spec.js` with:
```js
const { test, expect } = require('@playwright/test');

// Visual baselines are generated locally; production renders may differ.
test.skip(({ baseURL }) => !baseURL?.includes('localhost'), 'Homepage visual tests run only against the local dev server');

test.describe('@visual Homepage', () => {
  test('homepage matches baseline', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveScreenshot('homepage.png', { maxDiffPixels: 100 });
  });

  test('homepage mobile matches baseline', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page).toHaveScreenshot('homepage-mobile.png', { maxDiffPixels: 100 });
  });

  test('manufacturer logos are visible', async ({ page }) => {
    await page.goto('/');
    const logos = page.locator('section img[alt]');
    await expect(logos).toHaveCount(9);
    for (const name of ['Pilkington', 'Saint-Gobain Sekurit', 'AGC Automotive', 'PGW Auto Glass', 'Glavista', 'Fuyao', 'XYG', 'NordGlass', 'Euroglass']) {
      const logo = page.locator(`img[alt="${name}"]`);
      await expect(logo).toBeVisible();
    }
  });
});
```

- [ ] **Step 2: Commit the visual test update**

Run:
```bash
cd /Users/taj/bilglass
git add e2e/homepage-visual.spec.js
git commit -m "test: assert manufacturer logos are visible"
```

---

### Task 6: Update accessibility test for logo alt text

**Files:**
- Modify: `e2e/homepage-a11y.spec.js`

- [ ] **Step 1: Add logo alt-text assertion**

Append this test to `test.describe('@a11y Homepage accessibility', () => { ... })` in `e2e/homepage-a11y.spec.js`:
```js
  test('manufacturer logo images have non-empty alt text', async ({ page }) => {
    await page.goto('/');
    const logos = page.locator('section img[alt]');
    const count = await logos.count();
    expect(count).toBe(9);
    for (let i = 0; i < count; i++) {
      const alt = await logos.nth(i).getAttribute('alt');
      expect(alt).toBeTruthy();
      expect(alt.trim()).not.toBe('');
    }
  });
```

- [ ] **Step 2: Commit the accessibility test update**

Run:
```bash
cd /Users/taj/bilglass
git add e2e/homepage-a11y.spec.js
git commit -m "test: assert manufacturer logos have alt text"
```

---

### Task 7: Build the frontend

**Files:**
- Verify: `frontend/dist/` is generated successfully.

- [ ] **Step 1: Build the frontend**

Run:
```bash
cd /Users/taj/bilglass/frontend
npm run build
```
Expected: `dist/` is created with no errors.

- [ ] **Step 2: Confirm logos are copied to dist**

Run:
```bash
ls -la /Users/taj/bilglass/frontend/dist/images/logos/
```
Expected: all nine logo files are present.

- [ ] **Step 3: Commit the build output if tracked**

If `frontend/dist/` is tracked, run:
```bash
cd /Users/taj/bilglass
git add frontend/dist/
git commit -m "chore: rebuild frontend with manufacturer logos"
```
Otherwise skip this step.

---

### Task 8: Run unit tests

**Files:**
- Verify: existing unit tests still pass.

- [ ] **Step 1: Run Vitest**

Run:
```bash
cd /Users/taj/bilglass/frontend
npm test
```
Expected: all tests pass.

---

### Task 9: Run homepage E2E tests locally

**Files:**
- Verify: `e2e/homepage-visual.spec.js` and `e2e/homepage-a11y.spec.js` pass.

- [ ] **Step 1: Start the dev server in the background**

Run:
```bash
cd /Users/taj/bilglass/frontend
npm run dev &
```
Wait until the server is ready on `http://localhost:5173` (or the port printed in the terminal).

- [ ] **Step 2: Run the homepage E2E tests**

Run:
```bash
cd /Users/taj/bilglass
npx playwright test e2e/homepage-visual.spec.js e2e/homepage-a11y.spec.js
```
Expected: tests pass. Visual baselines may need regeneration if the new logos change the screenshot.

- [ ] **Step 3: Regenerate baselines if necessary**

If visual tests fail due to baseline differences, run:
```bash
cd /Users/taj/bilglass
npx playwright test e2e/homepage-visual.spec.js --update-snapshots
```

- [ ] **Step 4: Stop the dev server**

Run:
```bash
pkill -f "vite"
```

- [ ] **Step 5: Commit updated snapshots**

Run:
```bash
cd /Users/taj/bilglass
git add e2e/homepage-visual.spec.js-snapshots/
git commit -m "test: update homepage visual baselines"
```

---

## Self-review

1. **Spec coverage:**
   - Logo assets in `public/images/logos/` → Tasks 1–3.
   - Original colours preserved → component uses provided files.
   - Contrast card on dark background → component wraps logos in `bg-carbon-900/60` card.
   - Image fallback on error → `onError` state renders badge.
   - Accessibility → `alt` text, tests in Task 6.
   - Testing → Tasks 5, 6, 8, 9.

2. **Placeholder scan:** No TBD, TODO, or vague instructions remain. Every command is explicit and every code block is complete.

3. **Type consistency:** `Manufacturer.logo` is now required (`logo: string`) and matches usage in `MANUFACTURERS`.

# Frontend Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the React frontend's user experience by displaying prices, optimizing mobile layout, and completing the cart flow.

**Architecture:** Add price display components that gracefully handle missing prices. Mobile optimization uses Tailwind responsive utilities. Cart flow uses existing zustand store with customer type selection.

**Tech Stack:** React 18, Vite, Tailwind CSS, shadcn/ui, zustand, React Query, Lucide icons

---

## File Map

| File | Responsibility |
|------|---------------|
| `frontend/src/components/catalog/ProductCard.tsx` | Display glass product card with price |
| `frontend/src/components/catalog/ProductDetail.tsx` | Full product view with price and add-to-cart |
| `frontend/src/pages/SearchPage.tsx` | Mobile-optimized search results layout |
| `frontend/src/components/cart/CustomerTypeSelector.tsx` | NEW — Select customer type before adding to cart |
| `frontend/src/components/layout/Header.tsx` | Already has login button (verify polish) |
| `frontend/src/i18n/translations.ts` | Price-related translations |

---

### Task 1: Price Display in ProductCard

**Files:**
- Modify: `frontend/src/components/catalog/ProductCard.tsx`
- Test: Manual — verify in browser with products that have/don't have prices

**Context:**
- ProductCard receives a `Product` object with optional `price: number | null`
- Currently shows: title, image, category, equipment badges
- Should show price when available, or "Kontakt oss for pris" when null

- [ ] **Step 1: Add price display with conditional rendering**

```tsx
// In ProductCard, add after the title/brand section:
<div className="mt-2">
  {product.price ? (
    <span className="text-lg font-bold text-autoglass-blue">
      {product.price.toLocaleString('nb-NO')} kr
    </span>
  ) : (
    <span className="text-sm text-gray-500 italic">
      {t('product.contactForPrice')}
    </span>
  )}
</div>
```

- [ ] **Step 2: Add translation key**

In `frontend/src/i18n/translations.ts`, add to all three languages:
```ts
// no
'product.contactForPrice': 'Kontakt oss for pris',
// sv
'product.contactForPrice': 'Kontakta oss för pris',
// en
'product.contactForPrice': 'Contact us for price',
```

- [ ] **Step 3: Style the price block**

Use Tailwind classes:
- Price: `text-lg font-bold text-autoglass-blue`
- No price: `text-sm text-gray-500 italic`

- [ ] **Step 4: Verify in browser**

Run `cd frontend && npm run dev`, search for a regnr that returns priced products (e.g., `EB31442` if it has prices). Verify both states.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/catalog/ProductCard.tsx frontend/src/i18n/translations.ts
git commit -m "feat(frontend): show price in ProductCard with fallback"
```

---

### Task 2: Price Display in ProductDetail

**Files:**
- Modify: `frontend/src/components/catalog/ProductDetail.tsx`

**Context:**
- ProductDetail shows full product info in a modal/drawer
- Same `price` field available on `Product`

- [ ] **Step 1: Add prominent price display**

```tsx
// Near the top of ProductDetail, below title:
<div className="mt-4 p-4 bg-gray-50 rounded-lg">
  {product.price ? (
    <div className="flex items-baseline gap-2">
      <span className="text-3xl font-bold text-autoglass-blue">
        {product.price.toLocaleString('nb-NO')} kr
      </span>
      <span className="text-sm text-gray-500">{t('product.exclVAT')}</span>
    </div>
  ) : (
    <p className="text-gray-600">
      {t('product.contactForPriceDetail')}
    </p>
  )}
</div>
```

- [ ] **Step 2: Add translation keys**

```ts
// no
'product.exclVAT': 'ekskl. mva',
'product.contactForPriceDetail': 'Kontakt oss for pristilbud på dette produktet.',
// sv
'product.exclVAT': 'exkl. moms',
'product.contactForPriceDetail': 'Kontakta oss för prisförslag på denna produkt.',
// en
'product.exclVAT': 'excl. VAT',
'product.contactForPriceDetail': 'Contact us for a price quote on this product.',
```

- [ ] **Step 3: Verify**

Open ProductDetail for products with and without prices.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/catalog/ProductDetail.tsx frontend/src/i18n/translations.ts
git commit -m "feat(frontend): show price in ProductDetail modal"
```

---

### Task 3: Mobile-Optimized Search Results

**Files:**
- Modify: `frontend/src/pages/SearchPage.tsx`

**Context:**
- SearchPage shows vehicle card + candidate list
- On mobile (<768px), the layout is cramped
- Candidates are in a grid that becomes single-column but cards are too tall

- [ ] **Step 1: Optimize candidate grid for mobile**

```tsx
// Change grid classes from:
// className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
// To:
className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
```

- [ ] **Step 2: Compact ProductCard on mobile**

In `ProductCard.tsx`, reduce padding and image size on small screens:
```tsx
<div className="p-3 sm:p-4">
  <img className="h-24 sm:h-32 w-full object-contain" ... />
</div>
```

- [ ] **Step 3: Sticky category filter on mobile**

```tsx
<div className="sticky top-14 z-30 bg-white border-b py-2 md:static">
  {/* Category filter chips */}
</div>
```

- [ ] **Step 4: Test on mobile viewport**

Use browser dev tools, test 375px width.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/SearchPage.tsx frontend/src/components/catalog/ProductCard.tsx
git commit -m "feat(frontend): mobile-optimize search results layout"
```

---

### Task 4: Customer Type Selector for Cart

**Files:**
- Create: `frontend/src/components/cart/CustomerTypeSelector.tsx`
- Modify: `frontend/src/components/catalog/ProductCard.tsx`
- Modify: `frontend/src/stores/cartStore.ts`

**Context:**
- Cart store exists but doesn't track customer type
- B2B customers get different pricing than consumers
- Need to select type before adding to cart

- [ ] **Step 1: Extend cart store with customer type**

```ts
// In cartStore.ts, add:
type CustomerType = 'workshop' | 'dealer' | 'private';

interface CartState {
  // ...existing
  customerType: CustomerType | null;
  setCustomerType: (type: CustomerType) => void;
}
```

- [ ] **Step 2: Create CustomerTypeSelector component**

```tsx
// frontend/src/components/cart/CustomerTypeSelector.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Wrench, Store, User } from 'lucide-react';

const TYPES = [
  { id: 'workshop' as const, label: 'Verksted', icon: Wrench },
  { id: 'dealer' as const, label: 'Forhandler', icon: Store },
  { id: 'private' as const, label: 'Privat', icon: User },
];

export function CustomerTypeSelector({ onSelect }: { onSelect: (type: string) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">Velg kundetype for riktig prising:</p>
      <div className="grid grid-cols-3 gap-2">
        {TYPES.map((type) => (
          <Button
            key={type.id}
            variant="outline"
            className="flex flex-col items-center gap-1 h-auto py-3"
            onClick={() => onSelect(type.id)}
          >
            <type.icon className="h-5 w-5" />
            <span className="text-xs">{type.label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Integrate selector into add-to-cart flow**

In `ProductCard.tsx`, show selector if `customerType` is not set:
```tsx
const [showTypeSelector, setShowTypeSelector] = useState(false);

const handleAddToCart = () => {
  if (!customerType) {
    setShowTypeSelector(true);
    return;
  }
  addToCart(product);
};
```

- [ ] **Step 4: Add translations**

```ts
'cart.selectCustomerType': 'Velg kundetype',
'cart.customerType.workshop': 'Verksted',
'cart.customerType.dealer': 'Forhandler',
'cart.customerType.private': 'Privat',
```

- [ ] **Step 5: Test flow**

Click "Legg i handlekurv" → selector appears → select type → product added.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/cart/ frontend/src/stores/cartStore.ts frontend/src/components/catalog/ProductCard.tsx frontend/src/i18n/translations.ts
git commit -m "feat(frontend): add customer type selector to cart flow"
```

---

### Task 5: Polish Header Login Button

**Files:**
- Modify: `frontend/src/components/layout/Header.tsx` (already done, verify)

- [ ] **Step 1: Verify login button renders correctly**

Check desktop (md+) and mobile (<md) breakpoints.

- [ ] **Step 2: Ensure button matches design system**

Use `variant="default"` for primary action button (already done).

- [ ] **Step 3: Test navigation**

Click "Logg inn" → should navigate to `/kundeportal.html` (non-SPA navigation).

- [ ] **Step 4: Commit if changes needed**

```bash
git add frontend/src/components/layout/Header.tsx
git commit -m "polish(frontend): verify login button in Header"
```

---

## Spec Coverage Check

| Requirement | Task |
|-------------|------|
| Show price when available | Task 1, Task 2 |
| Show "contact for price" when missing | Task 1, Task 2 |
| Mobile-optimized search | Task 3 |
| Customer type selection | Task 4 |
| Login button visible | Task 5 |

## Placeholder Scan

- ✅ No "TBD" or "TODO"
- ✅ All steps have actual code
- ✅ All translations provided
- ✅ Test commands specified

## Execution Handoff

**Plan complete.** 

**Recommended approach:** Subagent-Driven Development — each task is independent (touches different files), perfect for fresh subagent per task.

**If executing inline:** Tasks 1-3 can be done in parallel (different components). Task 4 depends on cartStore changes. Task 5 is verification-only.

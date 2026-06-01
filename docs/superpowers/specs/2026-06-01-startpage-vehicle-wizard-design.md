# Startpage Vehicle Search Wizard — Design Specification

**Date:** 2026-06-01  
**Project:** Autoglass AS B2B Grossistnettside  
**Status:** Approved for Implementation  

---

## 1. Overview

### 1.1 Goal
Improve product discovery by replacing the single regnr input with a guided wizard that reduces false positives from prefix4 fallback matching.

### 1.2 Problem Statement
Current search relies heavily on prefix4 fallback which returns too many false positives. When exact kType matching fails, users get inaccurate results without an easy way to refine their search.

### 1.3 Success Criteria
- Reduce false positive rate in search results
- Maintain fast path for exact kType matches (regnr → direct results)
- Provide clear fallback path with user-guided refinement
- Works seamlessly on mobile devices

---

## 2. Component Architecture

### 2.1 New Components

```
frontend/src/components/search/
├── VehicleWizard/                    # Main wizard container
│   ├── VehicleWizard.tsx             # State machine & orchestration
│   ├── WizardStep.tsx                # Reusable step wrapper
│   └── index.ts                      # Public exports
├── VehicleWizard/steps/
│   ├── RegnrStep.tsx                 # Step 1: Regnr input + kType lookup
│   ├── BrandStep.tsx                 # Step 2: Brand selection grid
│   ├── ModelStep.tsx                 # Step 3: Model selection (filtered)
│   ├── YearStep.tsx                  # Step 4: Year/generation selection
│   └── SummaryStep.tsx               # Step 5: Confirm & show results
└── VehicleWizard/hooks/
    ├── useKtypeLookup.ts             # Hook for kType API call
    ├── useVehicleOptions.ts          # Hook for brand/model/year queries
    └── useWizardState.ts             # Wizard state management
```

### 2.2 Modified Components
- `HeroSearch.tsx` — Replace current search with VehicleWizard
- `HomePage.tsx` — Minor layout adjustments for wizard height

### 2.3 Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| VehicleWizard | Orchestrates step flow, manages global wizard state |
| WizardStep | Renders step progress, handles back/next navigation |
| RegnrStep | Input validation, kType API call, loading states |
| BrandStep | Display brand grid, handle selection |
| ModelStep | Filter by brand, display models, search filter |
| YearStep | Filter by brand+model, display year ranges |
| SummaryStep | Confirm vehicle, fetch and display products |

---

## 3. Data Flow

### 3.1 State Machine

```
[INIT] ──► [REGNR_STEP]
              │
              ▼ (user enters regnr)
        [KTYPE_LOOKUP] ──► Success? ──Yes──► [SUMMARY_STEP]
              │                              (show exact matches)
              No
              │
              ▼
        [BRAND_STEP] ◄──────┐
              │              │
              ▼              │
        [MODEL_STEP] ───────┘ (back navigation)
              │
              ▼
        [YEAR_STEP]
              │
              ▼
        [SUMMARY_STEP]
              │
              ▼
        [PRODUCT_RESULTS]
```

### 3.2 API Endpoints

| Endpoint | Method | Purpose | Data Source |
|----------|--------|---------|-------------|
| `/api/vehicle/ktype/:regnr` | GET | Lookup kType by regnr | Worker → Bovsoft/D1 |
| `/api/vehicle/brands` | GET | Get distinct brands | D1 ktype_registry |
| `/api/vehicle/models?brand=X` | GET | Get models for brand | D1 ktype_registry |
| `/api/vehicle/years?brand=X&model=Y` | GET | Get years for brand+model | D1 ktype_registry |
| `/api/products/search?ktype=X` | GET | Get products by kType | KV catalog |

### 3.3 State Schema

```typescript
interface WizardState {
  step: 'regnr' | 'brand' | 'model' | 'year' | 'summary';
  regnr: string;
  ktype?: string;           // From exact match
  selectedBrand?: string;
  selectedModel?: string;
  selectedYear?: string;
  vehicleData?: VehicleData; // Final resolved vehicle
}

interface VehicleData {
  brand: string;
  model: string;
  yearRange: string;
  ktype?: string;
}
```

### 3.4 Navigation Rules
- **Next:** Enabled when current step has valid selection
- **Back:** Available from brand step onwards, preserves selections
- **Skip:** Not allowed — all steps must be completed
- **Cancel:** Clears state, returns to regnr step

---

## 4. UI/UX Design

### 4.1 Step 1: Regnr Input
- Clean input field with format hint "AB 12345 eller AB12345"
- "Finn bilglass" primary CTA button
- Loading spinner during API call
- Inline validation: red border + message for invalid format
- Auto-normalize: strip spaces, uppercase

### 4.2 Step 2: Brand Selection
- Displayed only if kType lookup fails
- Grid of brand logos (8-12 visible, scroll for more)
- Alphabetically sorted
- Search filter at top for quick filtering
- Visual selection: highlight + checkmark on selection

### 4.3 Step 3: Model Selection
- List of models for selected brand
- Grouped by series (e.g., "3-serie", "5-serie")
- Search filter within models
- Show model count per group

### 4.4 Step 4: Year Selection
- Card-based year ranges
- Show generation info if available (e.g., "2018-2022 (G20)")
- Visual timeline representation

### 4.5 Step 5: Summary & Results
- Confirm vehicle: "[Brand] [Model] [Year]"
- "Endre" link to go back and modify
- Product grid with images, prices, stock status
- "Søk igjen" button to restart wizard

### 4.6 Progress Indicator
- Steps shown as: 1 → 2 → 3 → 4
- Current step highlighted
- Completed steps checkmarked
- Mobile: Compact dots or "Steg X av 4"

### 4.7 Mobile Considerations
- Bottom sheet for step navigation (optional)
- Full-width touch targets (min 44px)
- Sticky progress indicator
- Keyboard-aware input fields

---

## 5. Error Handling

### 5.1 Error Scenarios

| Scenario | User-Facing Message | Recovery |
|----------|---------------------|----------|
| Invalid regnr format | "Ugyldig registreringsnummer. Format: AB12345" | Fix input, retry |
| kType API timeout | "Treg respons — prøv igjen eller fortsett manuelt" | Retry or skip to brand step |
| No brands in D1 | "Ingen data tilgjengelig — kontakt support" | Show support contact |
| Brand selected but no models | "Ingen modeller funnet for [brand]" | Back to brand selection |
| Network failure | "Nettverksfeil — sjekk tilkobling" | Retry button |
| No products match selection | "Ingen produkter funnet. Prøv annet årsmodell eller kontakt oss." | Back to year step OR contact form |
| Empty ktype_registry | "Laster data..." → fallback to static list | Use cached/static list |

### 5.2 Technical Error Handling
- **Concurrent requests:** Cancel in-flight with AbortController
- **Special characters:** Auto-normalize (strip spaces, uppercase)
- **API failures:** Graceful degradation to manual wizard
- **Empty states:** Always show helpful message + action

### 5.3 Loading States
- Skeleton loaders for brand/model lists
- Spinner during kType lookup
- Disabled next button until selection
- Progress bar for multi-step indication

---

## 6. Testing Strategy

### 6.1 Unit Tests

**useWizardState hook:**
- State transitions between steps
- Back navigation preserves data
- Reset clears all state

**Step components:**
- Render correctly with/without data
- Selection updates state
- Validation shows/hides errors

### 6.2 Integration Tests

**Happy paths:**
1. Valid regnr → kType match → direct to results
2. Invalid regnr → brand → model → year → results

**Fallback paths:**
1. kType timeout → manual wizard works
2. Back navigation from any step
3. Modify selection and continue

### 6.3 Edge Case Tests

| Test Case | Expected Behavior |
|-----------|-------------------|
| Empty brand registry | Show static fallback list |
| Special chars in regnr (ÆØÅ, spaces, dashes) | Normalize to valid format |
| Rapid back/forward clicks | State remains consistent |
| API timeout > 5s | Show manual option, don't block |
| No products for valid vehicle | Show empty state with helpful message |
| 100+ models for brand | Virtual scrolling, no lag |
| Concurrent API requests | Cancel old, use latest |

### 6.4 E2E Tests

- Complete wizard flow (desktop + mobile)
- Analytics events fire correctly
- No PII in analytics (regnr hashed)

---

## 7. Analytics (Optional Enhancement)

Track events for funnel analysis:

| Event | Trigger |
|-------|---------|
| `wizard_started` | User clicks into regnr input |
| `ktype_success` | kType lookup returns match |
| `ktype_failed` | kType lookup fails/falls back |
| `step_completed` | User advances from each step |
| `wizard_completed` | Products displayed |
| `wizard_abandoned` | User leaves without completion |

---

## 8. Constraints & Assumptions

### 8.1 Constraints
- Use existing React/TypeScript stack
- Leverage D1 ktype_registry without schema changes
- Minimize new API dependencies
- Mobile-first responsive design

### 8.2 Assumptions
- D1 ktype_registry has brand/model/year hierarchy
- Worker API can serve vehicle options endpoints
- Existing product search by kType works reliably

---

## 9. Dependencies

### 9.1 Existing
- React 18+
- TypeScript
- Tailwind CSS (or existing styling system)
- React Query / SWR (if used for data fetching)

### 9.2 Potentially New
- None required
- Optional: `framer-motion` for step transitions

---

## 10. Open Questions

None. All requirements clarified during brainstorming session.

---

## 11. Approval

| Reviewer | Date | Status |
|----------|------|--------|
| Product Owner | 2026-06-01 | Approved |

---

*Next step: Invoke writing-plans skill to create implementation plan.*

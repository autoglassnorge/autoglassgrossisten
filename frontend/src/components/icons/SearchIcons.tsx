/**
 * Custom SVG icons for unified product search.
 * Industry-specific, HD-quality, consistent with GlassIcons stroke style.
 * No emojis, no generic icon libraries — purpose-built for Autoglass AS B2B.
 */

interface IconProps {
  className?: string;
}

// ───────────────────────────────────────────────
// QUICK-ACTION ICONS (search type selectors)
// ───────────────────────────────────────────────

/** Norwegian license plate — for regnr search */
export function RegnrSearchIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Plate frame */}
      <rect x="4" y="14" width="40" height="20" rx="3" stroke="currentColor" strokeWidth="2.5" />
      {/* Blue stripe (stylised) */}
      <path d="M4 20H44" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      {/* Registration text lines */}
      <path d="M10 28H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M24 28H38" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Country code dot */}
      <circle cx="8" cy="17" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** E-mark certification circle — for Eurocode search */
export function EurocodeSearchIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer certification ring */}
      <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="2.5" />
      {/* Inner ring */}
      <circle cx="24" cy="24" r="11" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      {/* Letter E */}
      <path d="M18 18V30" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M18 18H26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M18 24H24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M18 30H26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** OEM certified seal — for OE-number / original parts search */
export function OeNumberSearchIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer seal ring */}
      <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="2.5" />
      {/* Inner dashed ring effect */}
      <circle cx="24" cy="24" r="12" stroke="currentColor" strokeWidth="1.5" opacity="0.4" strokeDasharray="3 3" />
      {/* Checkmark = certified/original */}
      <path d="M16 24L21 29L32 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Vehicle + hierarchy steps — for brand/model/year wizard */
export function VehicleWizardIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Car side silhouette */}
      <path d="M8 32H32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M10 32V26C10 22 14 18 20 18C26 18 30 22 30 26V32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="13" cy="32" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="27" cy="32" r="3" stroke="currentColor" strokeWidth="2" />
      {/* Step indicator lines to the right */}
      <path d="M36 14H44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M36 20H42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M36 26H40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

/** Professor / expert avatar — for Professor Autoglass AI chat */
export function ProfessorSearchIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Head */}
      <circle cx="24" cy="17" r="10" stroke="currentColor" strokeWidth="2.5" />
      {/* Glasses left lens */}
      <circle cx="19" cy="17" r="3.5" stroke="currentColor" strokeWidth="2" />
      {/* Glasses right lens */}
      <circle cx="29" cy="17" r="3.5" stroke="currentColor" strokeWidth="2" />
      {/* Bridge */}
      <path d="M22.5 17H25.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Academic cap top */}
      <path d="M14 7H34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      {/* Shoulders */}
      <path d="M14 38C14 38 18 34 24 34C30 34 34 38 34 38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// ───────────────────────────────────────────────
// WIZARD STEP ICONS (5-step product identification)
// ───────────────────────────────────────────────

/** Brand / manufacturer badge — Step 1 */
export function BrandIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Shield outline */}
      <path d="M24 4L8 12V22C8 32 14 40 24 44C34 40 40 32 40 22V12L24 4Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      {/* Star inside = brand quality */}
      <path d="M24 16L26.5 22H33L27.5 26L29.5 33L24 29L18.5 33L20.5 26L15 22H21.5L24 16Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/** Car model silhouette — Step 2 */
export function ModelIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Sedan side profile */}
      <path d="M6 32H42" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M8 32V26C8 22 12 18 18 16H30C36 18 40 22 40 26V32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M18 16V12H30V16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="14" cy="32" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="34" cy="32" r="4" stroke="currentColor" strokeWidth="2" />
      {/* Window line */}
      <path d="M12 22H36" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
    </svg>
  );
}

/** Calendar / year selector — Step 3 */
export function YearIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Calendar frame */}
      <rect x="6" y="10" width="36" height="32" rx="3" stroke="currentColor" strokeWidth="2.5" />
      {/* Header line */}
      <path d="M6 18H42" stroke="currentColor" strokeWidth="2" />
      {/* Month tabs */}
      <path d="M16 10V4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M32 10V4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      {/* Year digits stylised as grid dots */}
      <circle cx="14" cy="26" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="26" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="34" cy="26" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="34" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="34" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="34" cy="34" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Equipment / features gear — Step 5 */
export function EquipmentIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Gear outer */}
      <path d="M24 14L26.5 18.5L31.5 17L33.5 21.5L38 23.5L36.5 28L40 31.5L36.5 35L38 39.5L33.5 41.5L31.5 46L26.5 44.5L24 49L21.5 44.5L16.5 46L14.5 41.5L10 39.5L11.5 35L8 31.5L11.5 28L10 23.5L14.5 21.5L16.5 17L21.5 18.5L24 14Z"
        stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      {/* Gear inner hub */}
      <circle cx="24" cy="31.5" r="6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

// ───────────────────────────────────────────────
// UTILITY ICONS (search UI chrome)
// ───────────────────────────────────────────────

/** Search magnifying glass — custom, not generic */
export function SearchLensIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="12" stroke="currentColor" strokeWidth="2.5" />
      <path d="M29 29L40 40" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="20" cy="20" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
    </svg>
  );
}

/** Arrow right for wizard navigation */
export function ArrowRightIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 24H38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M28 14L38 24L28 34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Arrow left for wizard navigation */
export function ArrowLeftIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M38 24H10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M20 14L10 24L20 34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Checkmark for completed wizard steps */
export function StepCheckIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="2.5" />
      <path d="M16 24L21 29L32 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Scan / barcode for SKU/article number input hint */
export function BarcodeIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="12" width="36" height="24" rx="2" stroke="currentColor" strokeWidth="2.5" />
      <path d="M10 16V32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 16V32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <path d="M18 16V32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M22 16V32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <path d="M26 16V32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M30 16V32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <path d="M34 16V32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M38 16V32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

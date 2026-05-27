export function formatPrice(n: number | null | undefined): string {
  if (n == null || isNaN(n) || n <= 0) {
    // Alltid vis pris — vis kontakt-oss når pris mangler
    return 'Kontakt oss';
  }
  return new Intl.NumberFormat('no-NO', { style: 'currency', currency: 'NOK' }).format(n);
}

export function formatYearRange(from: number | null, to: number | null): string {
  if (!from && !to) return '';
  if (from && to) return `${from}–${to}`;
  if (from) return `Fra ${from}`;
  return `Til ${to}`;
}

export const categoryLabels: Record<string, string> = {
  frontrute: 'Frontrute',
  bakrute: 'Bakrute',
  dørglass: 'Dørglass',
  sideglass: 'Sideglass',
  siderute: 'Siderute',
  tak: 'Takglass',
  annet: 'Annet',
  unknown: 'Ukjent',
};

export function categoryLabel(cat: string): string {
  return categoryLabels[cat] ?? cat;
}

export function formatLayerLabel(layer: number | undefined): string {
  if (layer === 1) return 'Eksakt match (kType)';
  if (layer === 2) return 'Brand + model + år';
  if (layer === 3) return 'Brand + år';
  if (layer === 4) return 'Brand only';
  return 'Søkeresultat';
}

export function formatConfidence(c: string): { label: string; color: string } {
  switch (c) {
    case 'exact': return { label: 'Eksakt match', color: 'bg-green-100 text-green-800' };
    case 'high': return { label: 'Høy treffsikkerhet', color: 'bg-emerald-100 text-emerald-800' };
    case 'medium': return { label: 'Middels treffsikkerhet', color: 'bg-amber-100 text-amber-800' };
    case 'low': return { label: 'Lav treffsikkerhet', color: 'bg-red-100 text-red-800' };
    default: return { label: 'Ukjent', color: 'bg-gray-100 text-gray-800' };
  }
}

export function maskVin(vin: string): string {
  if (!vin || vin.length < 10) return vin;
  return vin.slice(0, 3) + '•'.repeat(vin.length - 6) + vin.slice(-3);
}

// Type code helpers
export const typeCodeMeta: Record<string, { label: string; short: string; icon: string }> = {
  F:    { label: 'Frontrute', short: 'Front', icon: '🪟' },
  B:    { label: 'Bakrute', short: 'Bak', icon: '🔲' },
  DFF:  { label: 'Dørrute fremre førerside', short: 'Dør fv', icon: '🚪←f' },
  DFB:  { label: 'Dørrute fremre baksete venstre', short: 'Dør fh', icon: '🚪←b' },
  DPF:  { label: 'Dørrute fremre passasjerside', short: 'Dør pv', icon: '🚪→f' },
  DPB:  { label: 'Dørrute fremre baksete høyre', short: 'Dør ph', icon: '🚪→b' },
  SFB1: { label: 'Sideglass bak førerside', short: 'Side v', icon: '🪟←' },
  SPB1: { label: 'Sideglass bak passasjerside', short: 'Side h', icon: '🪟→' },
  DFBV: { label: 'Dørrute bak venstre', short: 'Dør bv', icon: '🚪←b' },
  DPBV: { label: 'Dørrute bak høyre', short: 'Dør bh', icon: '🚪→b' },
  DFFV: { label: 'Dørrute fremre venstre', short: 'Dør fv', icon: '🚪←f' },
  DPFV: { label: 'Dørrute fremre høyre', short: 'Dør fh', icon: '🚪→f' },
  SFB2: { label: 'Sideglass bak 2 førerside', short: 'Side v2', icon: '🪟←2' },
  SPB2: { label: 'Sideglass bak 2 passasjerside', short: 'Side h2', icon: '🪟→2' },
  SFB3: { label: 'Sideglass bak 3 førerside', short: 'Side v3', icon: '🪟←3' },
  SPB3: { label: 'Sideglass bak 3 passasjerside', short: 'Side h3', icon: '🪟→3' },
};

export function typeCodeLabel(code: string): string {
  return typeCodeMeta[code]?.label ?? code;
}

export function typeCodeShort(code: string): string {
  return typeCodeMeta[code]?.short ?? code;
}

export function typeCodeIcon(code: string): string {
  return typeCodeMeta[code]?.icon ?? '🔹';
}

// Position helpers
export function positionColor(position: string | null): string {
  if (position === 'driver') return 'bg-blue-500';
  if (position === 'passenger') return 'bg-red-500';
  return 'bg-gray-400';
}

export function positionLabel(position: string | null): string {
  if (position === 'driver') return 'Førerside';
  if (position === 'passenger') return 'Passasjerside';
  if (position === 'center') return 'Midt';
  return '';
}

// Confidence score helpers
export function confidenceFromScore(score: number): {
  variant: 'exact' | 'high' | 'medium' | 'low' | 'guess';
  label: string;
  colorClass: string;
  message?: string;
} {
  if (score >= 95) {
    return { variant: 'exact', label: '✓ Eksakt match', colorClass: 'bg-green-100 text-green-800 border-green-200' };
  }
  if (score >= 80) {
    return { variant: 'high', label: 'Høy treffsikkerhet', colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  }
  if (score >= 60) {
    return { variant: 'medium', label: 'Middels', colorClass: 'bg-amber-100 text-amber-800 border-amber-200' };
  }
  if (score >= 40) {
    return { variant: 'low', label: 'Lav treffsikkerhet', colorClass: 'bg-red-100 text-red-800 border-red-200', message: 'Verifiser før bestilling' };
  }
  return { variant: 'guess', label: 'Usikker', colorClass: 'bg-gray-100 text-gray-800 border-gray-200', message: 'Verifiser før bestilling' };
}

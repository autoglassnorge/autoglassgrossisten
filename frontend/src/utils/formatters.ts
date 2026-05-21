export function formatPrice(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '–';
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

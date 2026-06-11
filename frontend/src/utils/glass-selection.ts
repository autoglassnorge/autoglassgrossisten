import type { Product } from '@/types/api';

export type GlassCategory = 'frontrute' | 'bakrute' | 'dørglass' | 'sideglass';
export type GlassPosition = 'driver' | 'passenger';
export type DoorPlacement = 'front' | 'rear';

const DRIVER_TYPE_CODES = new Set(['DFF', 'DFB', 'DFFV', 'DFBV', 'SFB1', 'SFB2', 'SFB3']);
const PASSENGER_TYPE_CODES = new Set(['DPF', 'DPB', 'DPFV', 'DPBV', 'SPB1', 'SPB2', 'SPB3']);
const FRONT_DOOR_TYPE_CODES = new Set(['DFF', 'DPF', 'DFFV', 'DPFV']);
const REAR_DOOR_TYPE_CODES = new Set(['DFB', 'DPB', 'DFBV', 'DPBV']);

export const GLASS_CATEGORY_OPTIONS: Array<{ key: GlassCategory; label: string; shortLabel: string }> = [
  { key: 'frontrute', label: 'Frontrute', shortLabel: 'Front' },
  { key: 'dørglass', label: 'Dørrute', shortLabel: 'Dør' },
  { key: 'sideglass', label: 'Siderute', shortLabel: 'Side' },
  { key: 'bakrute', label: 'Bakrute', shortLabel: 'Bak' },
];

function textForProduct(product: Product): string {
  return [
    product.category,
    product.typeCode,
    product.typeCodeDesc,
    product.title,
    product.description,
    product.standardDescription,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function normalizeGlassCategory(product: Product): GlassCategory | 'annet' {
  const category = product.category?.toLowerCase() || '';
  const typeCode = product.typeCode?.toUpperCase() || '';
  const text = textForProduct(product);

  if (category === 'frontrute') return 'frontrute';
  if (category === 'bakrute') return 'bakrute';
  if (category.includes('dør') || category.includes('dor')) return 'dørglass';
  if (category.includes('side') || category.includes('siderute') || category.includes('ventil')) return 'sideglass';

  if (typeCode === 'F' || text.includes('frontrute')) return 'frontrute';
  if (typeCode === 'B' || text.includes('bakrute')) return 'bakrute';
  if (typeCode.startsWith('D') || text.includes('dørrute') || text.includes('dorrute')) return 'dørglass';
  if (typeCode.startsWith('S') || text.includes('siderute') || text.includes('ventilrute')) return 'sideglass';
  return 'annet';
}

export function inferGlassPosition(product: Product): GlassPosition | 'center' | 'both' | null {
  if (product.position === 'driver' || product.position === 'passenger' || product.position === 'center') {
    return product.position;
  }
  if (product.position === 'both') return 'both';

  const typeCode = product.typeCode?.toUpperCase() || '';
  if (DRIVER_TYPE_CODES.has(typeCode)) return 'driver';
  if (PASSENGER_TYPE_CODES.has(typeCode)) return 'passenger';

  const text = textForProduct(product);
  if (text.includes('førerside') || text.includes('foererside') || text.includes('venstre') || /\bvs\b/.test(text)) return 'driver';
  if (text.includes('passasjer') || text.includes('høyre') || text.includes('hoyre') || /\bhs\b/.test(text)) return 'passenger';
  return null;
}

export function inferDoorPlacement(product: Product): DoorPlacement | null {
  const typeCode = product.typeCode?.toUpperCase() || '';
  if (FRONT_DOOR_TYPE_CODES.has(typeCode)) return 'front';
  if (REAR_DOOR_TYPE_CODES.has(typeCode)) return 'rear';

  const text = textForProduct(product);
  if (text.includes('fremme') || text.includes('fremre') || text.includes('front')) return 'front';
  if (text.includes('bakre') || text.includes('bak ') || text.includes('rear')) return 'rear';
  return null;
}

export function productMatchesGlassSelection(
  product: Product,
  category: GlassCategory | null,
  position: GlassPosition | null,
  doorPlacement: DoorPlacement | null
): boolean {
  if (category && normalizeGlassCategory(product) !== category) return false;

  if (position) {
    const inferredPosition = inferGlassPosition(product);
    if (!inferredPosition) return false;
    if (inferredPosition && inferredPosition !== 'both' && inferredPosition !== position) return false;
  }

  if (category === 'dørglass' && doorPlacement) {
    const inferredPlacement = inferDoorPlacement(product);
    if (!inferredPlacement) return false;
    if (inferredPlacement && inferredPlacement !== doorPlacement) return false;
  }

  return true;
}

export function countByGlassCategory(products: Product[]): Record<GlassCategory, number> {
  return products.reduce((acc, product) => {
    const category = normalizeGlassCategory(product);
    if (category !== 'annet') {
      acc[category] += 1;
    }
    return acc;
  }, {
    frontrute: 0,
    bakrute: 0,
    dørglass: 0,
    sideglass: 0,
  } as Record<GlassCategory, number>);
}

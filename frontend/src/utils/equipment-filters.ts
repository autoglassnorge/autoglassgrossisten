/**
 * Shared equipment filter config for the React app.
 * Mirrors js/equipment-filters.js used by the static HTML pages.
 */

import type { Product } from '@/types/api';

export interface EquipmentFilterDef {
  key: string;
  fields: Array<keyof Product['properties']>;
  label: string;
}

export const EQUIPMENT_FILTER_OPTIONS: EquipmentFilterDef[] = [
  { key: 'adas', fields: ['adas'], label: 'ADAS' },
  { key: 'rainSensor', fields: ['rainSensor'], label: 'Regnsensor' },
  { key: 'heated', fields: ['heated'], label: 'Oppvarmet' },
  { key: 'acoustic', fields: ['acoustic'], label: 'Akustisk' },
  { key: 'antenna', fields: ['antenna'], label: 'Antenne' },
  { key: 'hud', fields: ['hud'], label: 'HUD' },
  { key: 'camera', fields: ['camera'], label: 'Kamera' },
  { key: 'laneAssist', fields: ['laneAssist'], label: 'Filskifteass.' },
  { key: 'solar', fields: ['solar', 'coated'], label: 'Coated / IR-glass / Solfilm' },
  { key: 'tinted', fields: ['tinted'], label: 'Tonet' },
];

export function productMatchesEquipmentFilters(
  product: Product,
  selectedKeys: string[]
): boolean {
  if (selectedKeys.length === 0) return true;
  return selectedKeys.every((key) => {
    const def = EQUIPMENT_FILTER_OPTIONS.find((d) => d.key === key);
    if (!def) return false;
    return def.fields.some((field) => product.properties[field] === true);
  });
}

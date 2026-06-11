/**
 * Shared utility for extracting equipment features from product descriptions
 * Used across multiple components for consistent feature detection
 * 
 * Matches the EquipmentFlags interface from @/types/api
 */

import type { EquipmentFlags } from '@/types/api';

export type { EquipmentFlags };

/**
 * Extract equipment features from a product description string
 * Uses regex patterns for flexible matching across languages
 */
export function extractFeatures(description?: string | null): EquipmentFlags {
  if (!description) {
    return {
      rainSensor: false,
      heated: false,
      acoustic: false,
      camera: false,
      adas: false,
      hud: false,
      antenna: false,
      laneAssist: false,
    };
  }

  const desc = description.toLowerCase();
  const upperDesc = description.toUpperCase();

  const hasCamera = /kamera|camera/i.test(desc) || /LDW|ADAS|CITY/.test(upperDesc);

  return {
    rainSensor: /regnsensor|rain sensor|vindusvisker|sens/i.test(desc) || /RSN|SENS/.test(upperDesc),
    heated: /oppvarmet|heated|elektrisk|varme|elm/i.test(desc) || /ELM|VARM|EL |\+EL/.test(upperDesc),
    acoustic: /akustisk|acoustic|lyddemp|aku/i.test(desc) || /AKU|AKUST/.test(upperDesc),
    camera: hasCamera,
    adas: /adas|assistanse/i.test(desc) || /LDW|CITY/.test(upperDesc) || hasCamera,
    hud: /hud|head-up|projeksjon/i.test(desc) || /HUD/.test(upperDesc),
    antenna: /antenne|antenna/i.test(desc) || /ANT|AG|GNAG/.test(upperDesc),
    laneAssist: /lane|filholder|ldw/i.test(desc) || /LDW/.test(upperDesc),
  };
}

/**
 * Legacy function for backward compatibility
 * Matches the original extractEquipment signature from BestMatchBanner
 */
export function extractEquipment(description: string): Record<string, boolean> {
  const features = extractFeatures(description);
  return {
    adas: features.adas,
    rainSensor: features.rainSensor,
    heated: features.heated,
    acoustic: features.acoustic,
    antenna: features.antenna,
    hud: features.hud,
    camera: features.camera,
    laneAssist: features.laneAssist,
    coated: false,
  };
}

/**
 * Extended feature set for WindshieldVerifier component
 * Includes Norwegian aliases for backward compatibility
 */
export function extractFeaturesExtended(description?: string | null): EquipmentFlags & {
  sensor: boolean;
  kamera: boolean;
  antenne: boolean;
  varme: boolean;
  akustisk: boolean;
  coated: boolean;
} {
  const base = extractFeatures(description);
  return {
    ...base,
    sensor: base.rainSensor,
    kamera: base.camera,
    antenne: base.antenna,
    varme: base.heated,
    akustisk: base.acoustic,
    coated: false,
  };
}

/**
 * Extract color information from product description
 */
export function extractColor(description?: string | null): string | null {
  if (!description) return null;
  const d = description.toUpperCase();
  if (d.includes('GN')) return 'green';
  if (d.includes('BL')) return 'blue';
  if (d.includes('GY')) return 'gray';
  if (d.includes('YP') || d.includes('SOTE')) return 'tinted';
  if (d.includes('CL')) return 'clear';
  return null;
}

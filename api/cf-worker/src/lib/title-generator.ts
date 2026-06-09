/**
 * Generate clean, standardized titles and descriptions from catalog records.
 */

import type { GlassRecord } from "../types";
import { inferRecordEquipment } from "./equipment";

/** Generate a clean, standardized title from catalog record data */
export function generateTitle(r: GlassRecord): string {
  const parts: string[] = [];

  // Brand + Model
  const brandModel = [r.brand, r.model].filter(Boolean).join(' ');
  if (brandModel) parts.push(brandModel);

  // Year range
  if (r.year_from && r.year_to) {
    parts.push(`(${r.year_from}–${r.year_to})`);
  } else if (r.year_from) {
    parts.push(`(fra ${r.year_from})`);
  }

  // Category
  const catMap: Record<string, string> = {
    frontrute: 'Frontrute',
    bakrute: 'Bakrute',
    'dørrute-frem': 'Dørrute fremme',
    'dørrute-bak': 'Dørrute bak',
    siderute: 'Siderute',
    annet: 'Annet glass',
  };
  const cat = catMap[r.category] || r.category;
  if (cat) parts.push('· ' + cat);

  // Color from description
  const d = (r.description || '').toUpperCase();
  const colorParts: string[] = [];
  if (d.includes('SOTE') || d.includes('YP')) colorParts.push('Sotet');
  else if (d.includes('GD') || d.includes('MØRK GRØNN')) colorParts.push('Mørk grønn');
  else if (d.includes('GN') && d.includes('SOLAR')) colorParts.push('Grønn solar');
  else if (d.includes('GN')) colorParts.push('Grønn');
  else if (d.includes('GY') && d.includes('EL')) colorParts.push('Grå m/el');
  else if (d.includes('GY')) colorParts.push('Grå');
  else if (d.includes('GB')) colorParts.push('Grå/blå');
  else if (d.includes('BL') && d.includes('BLÅ')) colorParts.push('Blå');
  else if (d.includes('BL')) colorParts.push('Blå');
  else if (d.includes('BZ') || d.includes('BRONZE')) colorParts.push('Bronze');
  else if (d.includes('CL') || d.includes('KLAR')) colorParts.push('Klar');

  // Equipment
  const eqParts: string[] = [];
  if (r.adas) eqParts.push('ADAS');
  if (r.heated) eqParts.push('Varme');
  if (r.rain_sensor) eqParts.push('Regnsensor');
  if (r.acoustic) eqParts.push('Akustisk');
  if (r.hud) eqParts.push('HUD');
  if (r.camera) eqParts.push('Kamera');

  // Build title
  let title = parts.join(' ');
  if (colorParts.length > 0) {
    title += ' · ' + colorParts.join(', ');
  }
  if (eqParts.length > 0) {
    title += ' · ' + eqParts.join(', ');
  }

  return title || `${r.brand || ''} ${r.model || ''}`.trim() || r.eurocode || '';
}

/** Generate a standardized human-readable description with full technical details */
export function generateDescription(r: GlassRecord): string {
  const parts: string[] = [];
  const d = (r.description || '').toUpperCase();
  const eq = inferRecordEquipment(r);

  // Vehicle info
  const vehicleParts: string[] = [];
  if (r.brand) vehicleParts.push(r.brand);
  if (r.model && r.model !== r.brand) vehicleParts.push(r.model);
  if (r.year_from && r.year_to) {
    vehicleParts.push(`${r.year_from}–${r.year_to}`);
  } else if (r.year_from) {
    vehicleParts.push(`fra ${r.year_from}`);
  }
  if (vehicleParts.length > 0) {
    parts.push('Kjøretøy: ' + vehicleParts.join(' '));
  }

  // Glass type / position
  const positionParts: string[] = [];
  const catMap: Record<string, string> = {
    frontrute: 'Frontrute',
    bakrute: 'Bakrute',
    'dørrute-frem': 'Dørrute fremme',
    'dørrute-bak': 'Dørrute bak',
    siderute: 'Siderute',
    annet: 'Annet glass',
  };
  const cat = catMap[r.category] || r.category;
  if (cat) positionParts.push(cat);

  // Side position (from parsed catalog field)
  if (r.position === 'driver') positionParts.push('venstre side (fører)');
  else if (r.position === 'passenger') positionParts.push('høyre side (passasjer)');
  else if (r.position === 'both') positionParts.push('begge sider');
  // Fallback: parse from description if position field not set
  else if (d.includes('VS') || d.includes('VENSTRE')) positionParts.push('venstre side');
  else if (d.includes('HS') || d.includes('HØYRE')) positionParts.push('høyre side');

  // Special variants
  if (d.includes('TODELT')) positionParts.push('todelt');
  if (d.includes('ÅPNB') || d.includes('ÅPNINGSBAR')) positionParts.push('åpningsbar');
  if (d.includes('LAV')) positionParts.push('lav');
  if (d.includes('LANG')) positionParts.push('lang');
  if (d.includes('KORT')) positionParts.push('kort');

  if (positionParts.length > 0) {
    parts.push('Type: ' + positionParts.join(', '));
  }

  // Color
  const colorParts: string[] = [];
  if (d.includes('SOTE') || d.includes('YP')) colorParts.push('Sotet');
  else if (d.includes('GD') || d.includes('MØRK GRØNN')) colorParts.push('Mørk grønn');
  else if (d.includes('GN') && d.includes('SOLAR')) colorParts.push('Grønn solar');
  else if (d.includes('GN')) colorParts.push('Grønn');
  else if (d.includes('GY')) colorParts.push('Grå');
  else if (d.includes('GB')) colorParts.push('Grå/blå');
  else if (d.includes('BL')) colorParts.push('Blå');
  else if (d.includes('BZ') || d.includes('BRONZE')) colorParts.push('Bronze');
  else if (d.includes('CL') || d.includes('KLAR')) colorParts.push('Klar');

  if (colorParts.length > 0) {
    parts.push('Farge: ' + colorParts.join(', '));
  }

  // Equipment
  const equipParts: string[] = [];
  if (r.adas) equipParts.push('ADAS (avansert førerassistanse)');
  if (r.heated) equipParts.push('Elektrisk oppvarming');
  if (r.rain_sensor) equipParts.push('Regnsensor');
  if (r.acoustic) equipParts.push('Akustisk laminert glass');
  if (r.hud) equipParts.push('Head-up display (HUD)');
  if (r.camera) equipParts.push('Kamera (f.eks. filskifteassistanse)');
  if (r.antenna) equipParts.push('Innebygd antenne');
  if (eq.shade) equipParts.push('Solbeskyttelse / privacy');

  if (equipParts.length > 0) {
    parts.push('Utstyr: ' + equipParts.join(', '));
  }

  // Dimensions
  let dims: { width?: number; height?: number; thickness?: number } = {};
  try {
    dims = JSON.parse(r.dimensions || '{}');
  } catch { /* ignore */ }
  if (dims.width || dims.height || dims.thickness) {
    const dimParts: string[] = [];
    if (dims.width) dimParts.push(`bredde ${dims.width} cm`);
    if (dims.height) dimParts.push(`høyde ${dims.height} cm`);
    if (dims.thickness) dimParts.push(`tykkelse ${dims.thickness} mm`);
    parts.push('Mål: ' + dimParts.join(', '));
  }

  // Lists / clips compatibility
  if (eq.listRequired) {
    const listType = eq.listType || 'lister';
    parts.push(`⚠ Krever ${listType} — bestilles separat`);
  } else if (eq.listIncluded) {
    const listType = eq.listType || 'lister';
    parts.push(`✓ Inkluderer ${listType}`);
  }
  if (eq.klipsRequired) {
    parts.push('⚠ Krever klips — bestilles separat');
  } else if (eq.hasKlips) {
    parts.push('✓ Inkluderer klips');
  }

  return parts.join('. ');
}

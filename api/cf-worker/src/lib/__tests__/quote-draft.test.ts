import { describe, it, expect } from 'vitest';
import { buildQuoteDraft, buildQuoteDraftFromTopCandidate } from '../quote-draft';
import type { GlassRecord, AccessoryItem } from '../../types';

const mockGlass = (overrides?: Partial<GlassRecord>): GlassRecord => ({
  id: 1,
  supplier_sku: 'SKU-001',
  eurocode: 'E001',
  article_number: null,
  scan_number: null,
  category: 'frontrute',
  supplier: null,
  brand: 'VW',
  model: 'Transporter',
  submodel: null,
  year_from: 2015,
  year_to: 2024,
  prefix4: 'ABCD',
  adas: 0,
  rain_sensor: 0,
  heated: 0,
  acoustic: 0,
  antenna: 0,
  hud: 0,
  shade: 0,
  camera: 0,
  lane_assist: 0,
  adas_features: null,
  price: 3200,
  stock_status: 1,
  warehouse_location: null,
  oem_numbers: null,
  cross_references: null,
  weight: null,
  dimensions: null,
  color: null,
  solar: null,
  tinted: null,
  description: 'Test glass',
  image_url: null,
  pdf_url: null,
  source: 'test',
  source_url: null,
  nags_codes: null,
  brand_original: null,
  ktype: null,
  created_at: null,
  ...overrides,
});

const mockAccessory = (overrides?: Partial<AccessoryItem>): AccessoryItem => ({
  sku: 'LIM-001',
  name: 'Lim',
  price: 189,
  included: true,
  removable: false,
  category: 'required',
  ...overrides,
});

describe('buildQuoteDraft', () => {
  it('returns empty quote for empty items', () => {
    const result = buildQuoteDraft([]);
    expect(result.items).toHaveLength(0);
    expect(result.subtotal).toBe(0);
    expect(result.accessoryTotal).toBe(0);
    expect(result.total).toBe(0);
  });

  it('calculates subtotal from product price and qty', () => {
    const glass = mockGlass({ price: 3200 });
    const result = buildQuoteDraft([{ product: glass, qty: 2 }]);
    expect(result.subtotal).toBe(6400);
  });

  it('handles null price as 0', () => {
    const glass = mockGlass({ price: null });
    const result = buildQuoteDraft([{ product: glass, qty: 1 }]);
    expect(result.subtotal).toBe(0);
  });

  it('calculates accessory total for all accessories (filtering is caller responsibility)', () => {
    const glass = mockGlass({ price: 3200 });
    const accessories: AccessoryItem[] = [
      mockAccessory({ sku: 'LIM', price: 189, included: true }),
      mockAccessory({ sku: 'KLIPS', price: 89, included: false }),
    ];
    const result = buildQuoteDraft([{ product: glass, qty: 1, accessories }]);
    // Builder sums ALL accessories; filtering by 'included' happens upstream
    expect(result.accessoryTotal).toBe(278);
    expect(result.subtotal).toBe(3200);
    expect(result.total).toBe(3478);
  });

  it('filters included-only when caller pre-filters accessories', () => {
    const glass = mockGlass({ price: 3200 });
    const allAccessories: AccessoryItem[] = [
      mockAccessory({ sku: 'LIM', price: 189, included: true }),
      mockAccessory({ sku: 'KLIPS', price: 89, included: false }),
    ];
    const includedOnly = allAccessories.filter(a => a.included);
    const result = buildQuoteDraft([{ product: glass, qty: 1, accessories: includedOnly }]);
    expect(result.accessoryTotal).toBe(189);
    expect(result.total).toBe(3389);
  });

  it('multiplies accessories by qty', () => {
    const glass = mockGlass({ price: 3200 });
    const accessories: AccessoryItem[] = [
      mockAccessory({ sku: 'LIM', price: 189 }),
      mockAccessory({ sku: 'KLIPS', price: 89 }),
    ];
    const result = buildQuoteDraft([{ product: glass, qty: 3, accessories }]);
    expect(result.subtotal).toBe(9600);
    expect(result.accessoryTotal).toBe(834); // (189+89)*3
    expect(result.total).toBe(10434);
  });

  it('includes notes when provided', () => {
    const glass = mockGlass();
    const result = buildQuoteDraft([{ product: glass, qty: 1 }], 'Rask levering ønsket');
    expect(result.notes).toBe('Rask levering ønsket');
  });

  it('sums multiple line items', () => {
    const glass1 = mockGlass({ id: 1, price: 3200 });
    const glass2 = mockGlass({ id: 2, price: 2800 });
    const result = buildQuoteDraft([
      { product: glass1, qty: 1 },
      { product: glass2, qty: 2 },
    ]);
    expect(result.subtotal).toBe(8800);
  });
});

describe('buildQuoteDraftFromTopCandidate', () => {
  it('builds quote from single candidate with accessories', () => {
    const glass = mockGlass({ price: 4500 });
    const accessories: AccessoryItem[] = [
      mockAccessory({ sku: 'LIM', price: 189 }),
      mockAccessory({ sku: 'KLIPS', price: 89 }),
    ];
    const result = buildQuoteDraftFromTopCandidate(glass, accessories);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].product.id).toBe(1);
    expect(result.items[0].accessories).toHaveLength(2);
    expect(result.subtotal).toBe(4500);
    expect(result.accessoryTotal).toBe(278);
    expect(result.total).toBe(4778);
  });

  it('uses default qty of 1', () => {
    const glass = mockGlass();
    const result = buildQuoteDraftFromTopCandidate(glass, []);
    expect(result.items[0].qty).toBe(1);
  });

  it('accepts custom qty', () => {
    const glass = mockGlass({ price: 1000 });
    const result = buildQuoteDraftFromTopCandidate(glass, [], 5);
    expect(result.items[0].qty).toBe(5);
    expect(result.subtotal).toBe(5000);
  });
});

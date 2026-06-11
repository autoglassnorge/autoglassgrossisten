import { describe, expect, it } from 'vitest';

import type { Product } from '@/types/api';
import {
  inferGlassPosition,
  normalizeGlassCategory,
  productMatchesGlassSelection,
} from './glass-selection';

function product(overrides: Partial<Product>): Product {
  return {
    id: 1,
    eurocode: 'TEST',
    brand: 'VW',
    model: 'TRANSPORTER T5',
    title: 'Test glass',
    description: 'VW TRANSPORTER T5 03-15 FRONTRUTE',
    category: 'frontrute',
    yearFrom: 2003,
    yearTo: 2015,
    articleNumber: 'TEST',
    price: 0,
    stockStatus: 0,
    imageUrl: '',
    typeCode: '',
    typeCodeDesc: '',
    position: null,
    properties: {
      heated: false,
      rainSensor: false,
      adas: false,
      hud: false,
      acoustic: false,
      antenna: false,
      color: null,
      solar: false,
      tinted: false,
    },
    sourceUrl: '',
    ...overrides,
  };
}

describe('glass selection helpers', () => {
  it('uses structured category before description text', () => {
    const slidingDoorGlass = product({
      category: 'sideglass',
      description: 'VW TRANSPORTER T5 03- DØRRUTE SKYVEDØR FAST VS',
    });

    expect(normalizeGlassCategory(slidingDoorGlass)).toBe('sideglass');
    expect(productMatchesGlassSelection(slidingDoorGlass, 'dørglass', 'driver', null)).toBe(false);
  });

  it('keeps both-side glass when either side is selected', () => {
    const bothSides = product({
      category: 'sideglass',
      position: 'both',
      description: 'VW TRANSPORTER T5 SIDERUTE',
    });

    expect(inferGlassPosition(bothSides)).toBe('both');
    expect(productMatchesGlassSelection(bothSides, 'sideglass', 'driver', null)).toBe(true);
    expect(productMatchesGlassSelection(bothSides, 'sideglass', 'passenger', null)).toBe(true);
  });

  it('requires known side when customer chooses a side', () => {
    const unknownSide = product({
      category: 'sideglass',
      position: null,
      description: 'VW TRANSPORTER T5 SIDERUTE',
    });

    expect(productMatchesGlassSelection(unknownSide, 'sideglass', 'driver', null)).toBe(false);
  });
});

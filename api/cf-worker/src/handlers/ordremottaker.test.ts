import { describe, expect, it } from 'vitest';
import { buildAccessoriesForContext } from './ordremottaker';

describe('buildAccessoriesForContext', () => {
  it('builds quote accessories from candidate equipment and answers', () => {
    const accessories = buildAccessoriesForContext(
      'frontrute',
      [{ properties: { adas: true, heated: true } }],
      { heated_type: 'camera' }
    );

    const skus = accessories.map((a) => a.sku);
    expect(skus).toContain('LIST-STD');
    expect(skus).toContain('LIM-STD');
    expect(skus).toContain('ADAS-WARN');
    expect(skus).toContain('LIM-HEAT-CAM');
    expect(accessories.reduce((sum, item) => sum + item.price, 0)).toBeGreaterThan(0);
  });

  it('uses side and door accessory set for detailed glass positions', () => {
    const doorAccessories = buildAccessoriesForContext('dørrute-fv', [], {});
    const sideAccessories = buildAccessoriesForContext('sideglass-bh', [], {});

    expect(doorAccessories.map((a) => a.sku)).toEqual(['KLIPS-STD', 'TETNING-STD']);
    expect(sideAccessories.map((a) => a.sku)).toEqual(['KLIPS-STD', 'TETNING-STD']);
  });
});

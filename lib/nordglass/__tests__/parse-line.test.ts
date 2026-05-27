/**
 * Nord Glass — Parser Tests
 * Representative test cases for all major line patterns.
 */

import { describe, it, expect } from 'vitest';
import { parseLine, parseVehicleSegment, parseFeatures, parseYear, parseDimensions } from '../parse-line';

describe('parseVehicleSegment', () => {
  it('parses MDX5RGR0101-0401', () => {
    const v = parseVehicleSegment('MDX5RGR0101-0401');
    expect(v.manufacturer).toBe('MDX5');
    expect(v.model).toBe('RGR');
    expect(v.productionFromRaw).toBe('0101');
    expect(v.productionToRaw).toBe('0401');
  });

  it('parses SPRINTER II3VAN0605-', () => {
    const v = parseVehicleSegment('SPRINTER II3VAN0605-');
    expect(v.manufacturer).toBe('SPRINTER');
    expect(v.model).toBe('II');
    expect(v.bodyType).toBe('3VAN');
    expect(v.productionFromRaw).toBe('0605');
  });

  it('parses A3 II3T0301-BOT', () => {
    const v = parseVehicleSegment('A3 II3T0301-BOT');
    expect(v.manufacturer).toBe('A3');
    expect(v.model).toBe('II');
    expect(v.bodyType).toBe('3T');
    expect(v.productionFromRaw).toBe('0301');
  });

  it('parses VITO VIANOMPV,2VAN9601-0308', () => {
    const v = parseVehicleSegment('VITO VIANOMPV,2VAN9601-0308');
    expect(v.manufacturer).toBe('VITO');
    expect(v.model).toBe('VIANOMPV,2');
    expect(v.bodyType).toBe('VAN');
    expect(v.productionFromRaw).toBe('9601');
    expect(v.productionToRaw).toBe('0308');
  });
});

describe('parseFeatures', () => {
  it('parses GSBL - sp mbO rectangle vin frame', () => {
    const f = parseFeatures('GSBL - sp mbO rectangle vin frame');
    expect(f.tintCode).toBe('BL');
    expect(f.hasVinWindow).toBe(true);
    expect(f.shapeNotes).toBe('rectangle');
    expect(f.featureCodes).toContain('GS');
    expect(f.featureCodes).toContain('BL');
    expect(f.featureCodes).toContain('vin');
    expect(f.featureCodes).toContain('frame');
  });

  it('parses GS 2 Lo', () => {
    const f = parseFeatures('GS 2 Lo');
    expect(f.featureCodes).toContain('GS');
    expect(f.featureCodes).toContain('2');
    expect(f.featureCodes).toContain('Lo');
  });
});

describe('parseYear', () => {
  it('parses 0101-0401', () => {
    const y = parseYear('0101-0401');
    expect(y.from).toBe('2001-01');
    expect(y.to).toBe('2004-01');
  });

  it('parses 0605-', () => {
    const y = parseYear('0605-');
    expect(y.from).toBe('2006-05');
    expect(y.to).toBeUndefined();
  });

  it('parses 9601', () => {
    const y = parseYear('9601');
    expect(y.from).toBe('1996-01');
    expect(y.warnings.length).toBeGreaterThan(0);
  });
});

describe('parseDimensions', () => {
  it('parses 1597x954', () => {
    const d = parseDimensions('1597x954');
    expect(d.width_mm).toBe(1597);
    expect(d.height_mm).toBe(954);
  });

  it('parses 960x510', () => {
    const d = parseDimensions('960x510');
    expect(d.width_mm).toBe(960);
    expect(d.height_mm).toBe(510);
  });
});

describe('parseLine — full integration', () => {
  it('parses WSWS windscreen', () => {
    const line = 'MDX5RGR0101-0401WSWS GSBL - sp mbO rectangle vin frameFW02182GBYN1597x954WS2182GBYUSA';
    const r = parseLine(line);

    expect(r.product_family).toBe('WSWS');
    expect(r.glass_category).toBe('windscreen');
    expect(r.glass_position).toBe('FR');
    expect(r.side).toBe('BOTH');
    expect(r.has_vin_window).toBe(true);
    expect(r.width_mm).toBe(1597);
    expect(r.height_mm).toBe(954);
    expect(r.parse_status).toBe('OK');
  });

  it('parses BOT door glass', () => {
    const line = 'A3 II3T0301-BOTKLVGS 2 Lo8580LGSH3FD960x510BO5285';
    const r = parseLine(line);

    expect(r.product_family).toBe('BOT');
    expect(r.glass_position).toBe('FD');
    expect(r.side).toBe('L');
    expect(r.parse_status).toBe('REVIEW');
  });

  it('parses WSWS Sprinter van', () => {
    const line = 'SPRINTER II3VAN0605-WSWS GS - sp mbF rectangle5439AGS1792x1008WS5439AGS';
    const r = parseLine(line);

    expect(r.product_family).toBe('WSWS');
    expect(r.glass_category).toBe('windscreen');
    expect(r.width_mm).toBe(1792);
    expect(r.height_mm).toBe(1008);
    expect(r.parse_status).toBe('OK');
  });

  it('parses BOAS opening side glass', () => {
    const line = 'VITO VIANOMPV,2VAN9601-0308BOASLHG 3 Lo5428LGNV4RQOW1086x555BO3577';
    const r = parseLine(line);

    expect(r.product_family).toBe('BOAS');
    expect(r.opening_type).toBe('OPENING');
    expect(r.side).toBe('L');
    expect(r.glass_position).toBe('RQ');
    expect(r.parse_status).toBe('REVIEW');
  });

  it('marks unknown family as HOLD', () => {
    const line = 'SOMETHING WEIRD0101-0401XYZ123';
    const r = parseLine(line);

    expect(r.product_family).toBe('UNKNOWN');
    expect(r.parse_status).toBe('HOLD');
    expect(r.parse_errors.length).toBeGreaterThan(0);
  });

  it('handles left/right side in internal code', () => {
    const line = 'BMW 3SERIES3VAN0101-0401BOT LGSH5FD960x510BO5285';
    const r = parseLine(line);

    expect(r.side).toBe('L');
    expect(r.glass_position).toBe('FD');
  });

  it('handles rear door opening', () => {
    const line = 'BMW 3SERIES3VAN0101-0401BOAS RGSH5RDO960x510BO5285';
    const r = parseLine(line);

    expect(r.glass_position).toBe('RDO');
    expect(r.side).toBe('R');
  });
});

describe('parseLine — malformed rows', () => {
  it('handles empty line', () => {
    const r = parseLine('');
    expect(r.parse_status).toBe('HOLD');
    expect(r.parse_errors.length).toBeGreaterThan(0);
  });

  it('handles line with no product family', () => {
    const r = parseLine('BMW X5 2001-2004 some random text');
    expect(r.product_family).toBe('UNKNOWN');
    expect(r.parse_status).toBe('HOLD');
  });

  it('handles line with no year', () => {
    const r = parseLine('BMW X5WSWS GSBL');
    expect(r.production_from_raw).toBe('');
    expect(r.parse_errors).toContain('Could not extract production year');
  });
});

describe('parseLine — duplicate variants', () => {
  it('heated vs non-heated should have different dedupe keys', () => {
    const line1 = 'BMW X53VAN0101-0401WSWS GSBLH FW02182GBYN1597x954WS2182GBY';
    const line2 = 'BMW X53VAN0101-0401WSWS GSBL FW02182GBYN1597x954WS2182GBY';

    const r1 = parseLine(line1);
    const r2 = parseLine(line2);

    expect(r1.has_heating).toBe(true);
    expect(r2.has_heating).toBe(null);
    expect(r1.dedupe_key).not.toBe(r2.dedupe_key);
  });

  it('left vs right should have different dedupe keys', () => {
    const line1 = 'BMW 3SERIES3VAN0101-0401BOT LGSH5FD960x510BO5285';
    const line2 = 'BMW 3SERIES3VAN0101-0401BOT RGSH5FD960x510BO5285';

    const r1 = parseLine(line1);
    const r2 = parseLine(line2);

    expect(r1.side).toBe('L');
    expect(r2.side).toBe('R');
    expect(r1.dedupe_key).not.toBe(r2.dedupe_key);
  });
});

describe('parseLine — ambiguous codes', () => {
  it('marks BOT/BOD/BOS/BOAS as REVIEW', () => {
    const lines = [
      'A3 3VAN0101-0401BOT KLVGS 2 Lo8580LGSH3FD960x510',
      'A3 3VAN0101-0401BOD KLVGS 2 Lo8580LGSH3RQ960x510',
      'A3 3VAN0101-0401BOS KLVGS 2 Lo8580LGSH3RQ960x510',
      'A3 3VAN0101-0401BOAS KLVGS 2 Lo8580LGNV4MQ960x510',
    ];

    for (const line of lines) {
      const r = parseLine(line);
      expect(r.parse_status).toBe('REVIEW');
    }
  });
});

describe('parseLine — windscreen vs body-glass confusion', () => {
  it('never confuses WSWS with BOT', () => {
    const ws = parseLine('BMW X53VAN0101-0401WSWS GSBL FW02182GBYN1597x954');
    const bot = parseLine('BMW 3SERIES3VAN0101-0401BOT LGSH5FD960x510');

    expect(ws.glass_category).toBe('windscreen');
    expect(bot.glass_category).toBe('door_glass');
    expect(ws.glass_position).toBe('FR');
    expect(bot.glass_position).toBe('FD');
  });
});

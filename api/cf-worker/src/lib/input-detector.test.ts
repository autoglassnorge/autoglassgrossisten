import { describe, it, expect } from 'vitest';
import { detectInputType, validateInput, type DetectedInput } from './input-detector.ts';

describe('detectInputType', () => {
  describe('regnr', () => {
    it('standard 4-digit regnr', () => {
      const result = detectInputType('AB1234');
      expect(result.type).toBe('regnr');
      expect(result.normalized).toBe('AB1234');
      expect(result.confidence).toBe(1.0);
    });

    it('standard 5-digit regnr', () => {
      const result = detectInputType('XY98765');
      expect(result.type).toBe('regnr');
      expect(result.normalized).toBe('XY98765');
      expect(result.confidence).toBe(1.0);
    });

    it('lowercase regnr', () => {
      const result = detectInputType('ab1234');
      expect(result.type).toBe('regnr');
      expect(result.normalized).toBe('AB1234');
    });

    it('regnr with spaces', () => {
      const result = detectInputType('A B 1 2 3 4');
      expect(result.type).toBe('regnr');
      expect(result.normalized).toBe('AB1234');
    });

    it('regnr with single space', () => {
      const result = detectInputType('AB 1234');
      expect(result.type).toBe('regnr');
      expect(result.normalized).toBe('AB1234');
    });

    it('regnr with dash separator', () => {
      const result = detectInputType('AB-12345');
      expect(result.type).toBe('regnr');
      expect(result.normalized).toBe('AB12345');
    });

    it('regnr with dot separator', () => {
      const result = detectInputType('AB.12345');
      expect(result.type).toBe('regnr');
      expect(result.normalized).toBe('AB12345');
    });
  });

  describe('vin', () => {
    it('valid 17-char VIN', () => {
      const vin = '1HGBH41JXMN109186';
      const result = detectInputType(vin);
      expect(result.type).toBe('vin');
      expect(result.normalized).toBe(vin);
      expect(result.confidence).toBe(1.0);
    });

    it('lowercase VIN', () => {
      const vin = '1hgbh41jxmn109186';
      const result = detectInputType(vin);
      expect(result.type).toBe('vin');
      expect(result.normalized).toBe('1HGBH41JXMN109186');
    });

    it('VIN with spaces', () => {
      const result = detectInputType('1HGBH 41JX MN109 186');
      expect(result.type).toBe('vin');
      expect(result.normalized).toBe('1HGBH41JXMN109186');
    });

    it('VIN with dash grouping', () => {
      const result = detectInputType('1HGBH-41JX-MN109186');
      expect(result.type).toBe('vin');
      expect(result.normalized).toBe('1HGBH41JXMN109186');
    });
  });

  describe('eurocode', () => {
    it('digit-led eurocode 4-2-4', () => {
      const result = detectInputType('1234AB5678');
      expect(result.type).toBe('eurocode');
      expect(result.confidence).toBe(1.0);
    });

    it('digit-led eurocode 3-2-1', () => {
      const result = detectInputType('123AB1');
      expect(result.type).toBe('eurocode');
    });

    it('digit-led eurocode with trailing letter', () => {
      const result = detectInputType('1234AB1C');
      expect(result.type).toBe('eurocode');
    });

    it('short digit-led eurocode', () => {
      const result = detectInputType('123A1');
      expect(result.type).toBe('eurocode');
    });

    it('letter-led eurocode 2-6 (not regnr)', () => {
      const result = detectInputType('XY123456');
      expect(result.type).toBe('eurocode');
    });

    it('AB1234 is regnr not eurocode (priority)', () => {
      const result = detectInputType('AB1234');
      expect(result.type).toBe('regnr');
    });

    it('XY12345 is regnr not eurocode (priority)', () => {
      const result = detectInputType('XY12345');
      expect(result.type).toBe('regnr');
    });
  });

  describe('oem', () => {
    it('numeric oem', () => {
      const result = detectInputType('12345678');
      expect(result.type).toBe('oem');
      expect(result.confidence).toBe(0.8);
    });

    it('alphanumeric oem', () => {
      const result = detectInputType('A1B2C3D4E5');
      expect(result.type).toBe('oem');
    });

    it('5-char oem minimum', () => {
      const result = detectInputType('12345');
      expect(result.type).toBe('oem');
    });

    it('20-char oem maximum', () => {
      const result = detectInputType('12345678901234567890');
      expect(result.type).toBe('oem');
    });

    it('21-char is sku (too long for oem)', () => {
      const result = detectInputType('123456789012345678901');
      expect(result.type).toBe('sku');
    });
  });

  describe('sku', () => {
    it('sku with hyphens', () => {
      const result = detectInputType('ABC-1234-XY');
      expect(result.type).toBe('sku');
      expect(result.confidence).toBe(0.8);
    });

    it('alphanumeric sku without hyphens (4 chars)', () => {
      const result = detectInputType('AB12');
      expect(result.type).toBe('sku');
    });

    it('numeric sku (4 chars)', () => {
      const result = detectInputType('1234');
      expect(result.type).toBe('sku');
    });

    it('alphanumeric sku 30 chars', () => {
      const result = detectInputType('ABCDEFGHIJ12345678901234567890');
      expect(result.type).toBe('sku');
    });

    it('31 chars is not sku', () => {
      const result = detectInputType('ABCDEFGHIJ123456789012345678901');
      expect(result.type).toBe('text');
    });
  });

  describe('text', () => {
    it('empty string', () => {
      const result = detectInputType('');
      expect(result.type).toBe('text');
      expect(result.normalized).toBe('');
      expect(result.confidence).toBe(0.5);
    });

    it('whitespace only', () => {
      const result = detectInputType('   ');
      expect(result.type).toBe('text');
      expect(result.normalized).toBe('');
    });

    it('natural language', () => {
      const result = detectInputType('VW Transporter 2005');
      expect(result.type).toBe('text');
      expect(result.normalized).toBe('VW Transporter 2005');
    });

    it('short text with special chars', () => {
      const result = detectInputType('hello!');
      expect(result.type).toBe('text');
    });

    it('3 chars alphanumeric', () => {
      const result = detectInputType('ABC');
      expect(result.type).toBe('text');
    });

    it('mixed case text preserved', () => {
      const result = detectInputType('Hello World');
      expect(result.type).toBe('text');
      expect(result.normalized).toBe('Hello World');
    });
  });
});

describe('validateInput', () => {
  describe('regnr', () => {
    it('valid regnr passes', () => {
      const detected = detectInputType('AB1234');
      const validation = validateInput(detected);
      expect(validation.valid).toBe(true);
      expect(validation.error).toBe(undefined);
    });

    it('invalid regnr format (1 letter) fails', () => {
      const detected: DetectedInput = { type: 'regnr', normalized: 'A1234', confidence: 1.0 };
      const validation = validateInput(detected);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('registration number');
    });

    it('invalid regnr format (3 letters) fails', () => {
      const detected: DetectedInput = { type: 'regnr', normalized: 'ABC1234', confidence: 1.0 };
      const validation = validateInput(detected);
      expect(validation.valid).toBe(false);
    });

    it('invalid regnr format (3 digits) fails', () => {
      const detected: DetectedInput = { type: 'regnr', normalized: 'AB123', confidence: 1.0 };
      const validation = validateInput(detected);
      expect(validation.valid).toBe(false);
    });

    it('invalid regnr format (6 digits) fails', () => {
      const detected: DetectedInput = { type: 'regnr', normalized: 'AB123456', confidence: 1.0 };
      const validation = validateInput(detected);
      expect(validation.valid).toBe(false);
    });
  });

  describe('vin', () => {
    it('valid vin passes', () => {
      const detected = detectInputType('1HGBH41JXMN109186');
      const validation = validateInput(detected);
      expect(validation.valid).toBe(true);
    });

    it('vin with I fails', () => {
      const detected: DetectedInput = { type: 'vin', normalized: '1HGBH41IXMN109186', confidence: 1.0 };
      const validation = validateInput(detected);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('I');
    });

    it('vin with O fails', () => {
      const detected: DetectedInput = { type: 'vin', normalized: '1HGBH41OXMN109186', confidence: 1.0 };
      const validation = validateInput(detected);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('O');
    });

    it('vin with Q fails', () => {
      const detected: DetectedInput = { type: 'vin', normalized: '1HGBH41QXMN109186', confidence: 1.0 };
      const validation = validateInput(detected);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Q');
    });

    it('short vin fails', () => {
      const detected: DetectedInput = { type: 'vin', normalized: '1HGBH41JXMN10918', confidence: 1.0 };
      const validation = validateInput(detected);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('17');
    });

    it('long vin fails', () => {
      const detected: DetectedInput = { type: 'vin', normalized: '1HGBH41JXMN1091867', confidence: 1.0 };
      const validation = validateInput(detected);
      expect(validation.valid).toBe(false);
    });
  });

  describe('other types', () => {
    it('eurocode is valid', () => {
      const detected = detectInputType('1234AB1');
      const validation = validateInput(detected);
      expect(validation.valid).toBe(true);
      expect(validation.error).toBe(undefined);
    });

    it('oem is valid', () => {
      const detected = detectInputType('12345678');
      const validation = validateInput(detected);
      expect(validation.valid).toBe(true);
    });

    it('sku is valid', () => {
      const detected = detectInputType('ABC-123');
      const validation = validateInput(detected);
      expect(validation.valid).toBe(true);
    });

    it('text is valid', () => {
      const detected = detectInputType('hello world');
      const validation = validateInput(detected);
      expect(validation.valid).toBe(true);
    });

    it('empty text is valid', () => {
      const detected = detectInputType('');
      const validation = validateInput(detected);
      expect(validation.valid).toBe(true);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { detectInputType, getInputTypeLabel, getPlaceholderForType } from '../UnifiedSearch/InputTypeDetector';

describe('detectInputType', () => {
  it('detects Norwegian registration numbers', () => {
    expect(detectInputType('AB12345')).toEqual({
      type: 'regnr',
      raw: 'AB12345',
      normalized: 'AB12345',
      confidence: 'high',
    });
    expect(detectInputType('  ab12345  ')).toEqual({
      type: 'regnr',
      raw: 'ab12345',
      normalized: 'AB12345',
      confidence: 'high',
    });
    expect(detectInputType('cv1234')).toEqual({
      type: 'regnr',
      raw: 'cv1234',
      normalized: 'CV1234',
      confidence: 'high',
    });
  });

  it('detects Eurocodes', () => {
    expect(detectInputType('M0080AGNCMV')).toEqual({
      type: 'eurocode',
      raw: 'M0080AGNCMV',
      normalized: 'M0080AGNCMV',
      confidence: 'high',
    });
  });

  it('detects SKU / article numbers', () => {
    expect(detectInputType('2304ACDCMUVZ2L')).toEqual({
      type: 'sku',
      raw: '2304ACDCMUVZ2L',
      normalized: '2304ACDCMUVZ2L',
      confidence: 'medium',
    });
  });

  it('detects OE numbers', () => {
    expect(detectInputType('12345678')).toEqual({
      type: 'oe',
      raw: '12345678',
      normalized: '12345678',
      confidence: 'high',
    });
  });

  it('detects VINs', () => {
    expect(detectInputType('WVWZZZ3CZLE123456')).toEqual({
      type: 'vin',
      raw: 'WVWZZZ3CZLE123456',
      normalized: 'WVWZZZ3CZLE123456',
      confidence: 'high',
    });
  });

  it('classifies plain text as free text', () => {
    expect(detectInputType('frontrute VW Transporter 2005')).toEqual({
      type: 'text',
      raw: 'frontrute VW Transporter 2005',
      normalized: 'FRONTRUTE VW TRANSPORTER 2005',
      confidence: 'high',
    });
  });

  it('returns empty type for empty input', () => {
    expect(detectInputType('')).toEqual({
      type: 'empty',
      raw: '',
      normalized: '',
      confidence: 'high',
    });
    expect(detectInputType('   ')).toEqual({
      type: 'empty',
      raw: '',
      normalized: '',
      confidence: 'high',
    });
  });
});

describe('getInputTypeLabel', () => {
  it('returns Norwegian labels for all types', () => {
    expect(getInputTypeLabel('regnr')).toBe('Registreringsnummer');
    expect(getInputTypeLabel('eurocode')).toBe('Eurocode');
    expect(getInputTypeLabel('sku')).toBe('Artikkelnummer');
    expect(getInputTypeLabel('oe')).toBe('OE-nummer');
    expect(getInputTypeLabel('vin')).toBe('VIN');
    expect(getInputTypeLabel('text')).toBe('Fritekst');
    expect(getInputTypeLabel('empty')).toBe('');
  });
});

describe('getPlaceholderForType', () => {
  it('returns example placeholders for all types', () => {
    expect(getPlaceholderForType('regnr')).toBe('AB12345');
    expect(getPlaceholderForType('eurocode')).toBe('M0080AGNCMV');
    expect(getPlaceholderForType('sku')).toBe('2304ACDCMUVZ2L');
    expect(getPlaceholderForType('oe')).toBe('5N0845011D');
    expect(getPlaceholderForType('vin')).toBe('WVWZZZ3CZLE123456');
    expect(getPlaceholderForType('text')).toBe('F.eks. frontrute VW Transporter 2005');
    expect(getPlaceholderForType('empty')).toContain('Regnr');
  });
});

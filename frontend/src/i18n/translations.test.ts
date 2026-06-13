import { expect, test } from 'vitest';
import { translations } from './translations';

const keys = Object.keys(translations.no);

test('all Norwegian keys exist in Swedish and English', () => {
  for (const key of keys) {
    expect(translations.sv[key], `missing sv key: ${key}`).toBeDefined();
    expect(translations.en[key], `missing en key: ${key}`).toBeDefined();
  }
});

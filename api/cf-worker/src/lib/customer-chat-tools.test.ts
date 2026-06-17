import { describe, it, expect, vi } from 'vitest';
import { executeTool } from './customer-chat-tools';
import type { Env } from '../types';

describe('customer-chat-tools', () => {
  const mockEnv = {
    GLASS_CATALOG_D1: {} as D1Database,
    GLASS_CATALOG: {} as KVNamespace,
  } as Env;

  it('askCustomer returns the question unchanged', async () => {
    const result = await executeTool(mockEnv, {
      tool: 'askCustomer',
      params: {
        question_key: 'adas',
        question_text: 'Har bilen ADAS?',
        options: [{ label: 'Ja', value: 'ja' }],
      },
    });
    expect(result).toHaveProperty('question_key', 'adas');
  });

  it('explainDifferences requires at least two ids', async () => {
    const result = await executeTool(mockEnv, {
      tool: 'explainDifferences',
      params: { candidate_ids: [1] },
    });
    expect(result.ok).toBe(false);
  });
});

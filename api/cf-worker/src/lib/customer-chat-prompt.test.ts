import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, responseJsonSchema } from './customer-chat-prompt';

describe('customer-chat-prompt', () => {
  it('includes guardrail against ordering', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('aldri opprette bestillinger');
  });

  it('defines tool schema for searchGlass', () => {
    const schema = responseJsonSchema();
    expect(JSON.stringify(schema)).toContain('searchGlass');
    expect(JSON.stringify(schema)).toContain('askCustomer');
    expect(JSON.stringify(schema)).toContain('handoverToHuman');
  });
});

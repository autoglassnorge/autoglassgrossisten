import { describe, it, expect } from 'vitest';
import type { ChatRequest, ChatEvent, ChatToolCall } from './customer-chat-types';

describe('customer-chat-types', () => {
  it('accepts a valid chat request', () => {
    const req: ChatRequest = {
      message: 'AB12345',
      session_token: '00000000-0000-0000-0000-000000000000',
      page_context: { path: '/sok', current_query: 'AB12345' },
      customer_id: 1,
      language: 'no',
    };
    expect(req.message).toBe('AB12345');
  });

  it('accepts a valid tool call payload', () => {
    const call: ChatToolCall = {
      tool: 'searchGlass',
      params: { regnr: 'AB12345', position: 'frontrute' },
    };
    expect(call.tool).toBe('searchGlass');
  });

  it('accepts a valid SSE event', () => {
    const ev: ChatEvent = { type: 'text', data: { delta: 'Hei' } };
    expect(ev.type).toBe('text');
  });
});

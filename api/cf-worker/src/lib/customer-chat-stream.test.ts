import { describe, it, expect } from 'vitest';
import { serializeEvent, createChatStream, sseResponse } from './customer-chat-stream';

describe('customer-chat-stream', () => {
  it('serializes an event to SSE wire format', () => {
    const wire = serializeEvent({ type: 'text', data: { delta: 'Hei' } });
    expect(wire).toContain('event: text');
    expect(wire).toContain('data: {"delta":"Hei"}');
    expect(wire).toContain('\n\n');
  });

  it('creates a stream that emits provided events', async () => {
    const stream = createChatStream([
      { type: 'typing', data: {} },
      { type: 'text', data: { delta: 'Hei' } },
      { type: 'done', data: {} },
    ]);
    const reader = stream.getReader();
    const chunks: string[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }
    const full = chunks.join('');
    expect(full).toContain('event: typing');
    expect(full).toContain('event: text');
    expect(full).toContain('event: done');
  });

  it('returns a Response with text/event-stream headers', () => {
    const stream = createChatStream([{ type: 'done', data: {} }]);
    const res = sseResponse(stream);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
  });
});

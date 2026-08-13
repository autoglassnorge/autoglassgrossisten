import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { env, createExecutionContext } from 'cloudflare:test';
import { handleCustomerChat } from './customer-chat';
import * as aiGateway from '../lib/ai-gateway';
import * as chatTools from '../lib/customer-chat-tools';
import migrationSql from '../../migrations/0024_customer_chat.sql?raw';

function splitSqlStatements(sql: string): string[] {
  const withoutComments = sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function collectSse(response: Response): Promise<{ type: string; data: unknown }[]> {
  const text = await response.text();
  const lines = text.split('\n').filter((l) => l.trim());
  const events: { type: string; data: unknown }[] = [];
  let current: { type?: string; data?: unknown } = {};
  for (const line of lines) {
    if (line.startsWith('event:')) {
      current.type = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      current.data = JSON.parse(line.slice(5).trim());
      if (current.type) {
        events.push({ type: current.type, data: current.data });
        current = {};
      }
    }
  }
  return events;
}

describe('handleCustomerChat integration', () => {
  let callLLMSpy: ReturnType<typeof vi.spyOn>;
  let executeToolSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    const db = env.GLASS_CATALOG_D1;
    const statements = splitSqlStatements(migrationSql).map((stmt) => db.prepare(stmt));
    await db.batch(statements);

    callLLMSpy = vi.spyOn(aiGateway, 'callLLM');
    executeToolSpy = vi.spyOn(chatTools, 'executeTool');
  });

  beforeEach(() => {
    callLLMSpy.mockReset();
    executeToolSpy.mockReset();
  });

  function ctx() {
    return createExecutionContext();
  }

  it('returns text/event-stream and greets with quick replies', async () => {
    callLLMSpy.mockResolvedValue({
      response: JSON.stringify({
        message: 'Hei! Jeg kan hjelpe deg å finne riktig glass.',
        quick_replies: [
          { label: 'Regnr', value: 'regnr' },
          { label: 'Merke/modell', value: 'merke' },
        ],
      }),
    });

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hei' }),
    });

    const response = await handleCustomerChat(request, env, ctx());

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    const events = await collectSse(response);
    expect(events.find((e) => e.type === 'meta')).toBeDefined();
    expect(events.find((e) => e.type === 'text')).toBeDefined();
    expect(events.find((e) => e.type === 'quick_replies')).toBeDefined();
    expect(events.find((e) => e.type === 'done')).toBeDefined();
  });

  it('routes regnr to searchGlass tool and emits product candidates', async () => {
    let step = 0;
    callLLMSpy.mockImplementation(() => {
      step++;
      if (step === 1) {
        return Promise.resolve({
          response: JSON.stringify({
            tool_calls: [{ tool: 'searchGlass', params: { regnr: 'SU18018' } }],
          }),
        });
      }
      return Promise.resolve({
        response: JSON.stringify({
          message: 'Her er passende glass for SU18018.',
          quick_replies: [{ label: 'Se detaljer', value: 'details' }],
        }),
      });
    });

    executeToolSpy.mockResolvedValue({
      ok: true,
      vehicle: { make: 'VW', model: 'Caravelle', year: 2005 },
      candidates: [
        {
          id: 1,
          brand: 'Pilkington',
          description: 'VW Caravelle 03-15 Frontrute',
          price: 3450,
          category: 'frontrute',
        },
      ],
      confidence: 1,
      reasons: ['regnr exact'],
    });

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'SU18018' }),
    });

    const response = await handleCustomerChat(request, env, ctx());

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    const events = await collectSse(response);
    expect(events.find((e) => e.type === 'meta')).toBeDefined();

    const toolCall = events.find(
      (e) =>
        e.type === 'tool_call' &&
        (e.data as { tool: string }).tool === 'searchGlass'
    );
    expect(toolCall).toBeDefined();
    expect((toolCall!.data as { params: { regnr: string } }).params.regnr).toBe('SU18018');

    const products = events.find((e) => e.type === 'products');
    expect(products).toBeDefined();
    expect(Array.isArray((products!.data as { candidates: unknown[] }).candidates)).toBe(true);
    expect((products!.data as { candidates: unknown[] }).candidates).toHaveLength(1);

    expect(events.find((e) => e.type === 'done')).toBeDefined();
  });
});

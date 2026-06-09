import { describe, it, expect } from 'vitest';
import { routeTools, executeTool, generateResponseFromToolResults, determineStatusFromTools, synthesizeSearchToolResult } from '../professor-tools';
import type { Env, ToolCall, GlassRecord, AccessoryItem } from '../../types';

const mockEnv = {} as Env;
const mockCtx = {} as ExecutionContext;

const mockGlass = (overrides?: Partial<GlassRecord>): GlassRecord => ({
  id: 1,
  supplier_sku: 'SKU-001',
  eurocode: 'E001',
  article_number: null,
  scan_number: null,
  category: 'frontrute',
  supplier: null,
  brand: 'VW',
  model: 'Transporter',
  submodel: null,
  year_from: 2015,
  year_to: 2024,
  prefix4: 'ABCD',
  adas: 0,
  rain_sensor: 0,
  heated: 0,
  acoustic: 0,
  antenna: 0,
  hud: 0,
  shade: 0,
  camera: 0,
  lane_assist: 0,
  adas_features: null,
  price: 3200,
  stock_status: 1,
  warehouse_location: null,
  oem_numbers: null,
  cross_references: null,
  weight: null,
  dimensions: null,
  color: null,
  solar: null,
  tinted: null,
  description: 'Test glass',
  image_url: null,
  pdf_url: null,
  source: 'test',
  source_url: null,
  nags_codes: null,
  brand_original: null,
  ktype: null,
  created_at: null,
  ...overrides,
});

const mockAccessory = (overrides?: Partial<AccessoryItem>): AccessoryItem => ({
  sku: 'LIM-001',
  name: 'Lim',
  price: 189,
  included: true,
  removable: false,
  category: 'required',
  ...overrides,
});

describe('routeTools', () => {
  it('routes regnr to search tool', () => {
    const ner = { regnr: 'SU18018', intent: 'bestill' };
    const result = routeTools(ner, 'Jeg trenger frontrute til SU18018');
    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe('search');
    expect(result[0].params.input).toBe('SU18018');
  });

  it('routes VIN to search tool', () => {
    const ner = { vin: 'WVWZZZ7HZ8D123456', intent: 'bestill' };
    const result = routeTools(ner, 'VIN WVWZZZ7HZ8D123456');
    expect(result[0].tool).toBe('search');
    expect(result[0].params.input).toBe('WVWZZZ7HZ8D123456');
  });

  it('routes make+model+year to search tool', () => {
    const ner = { make: 'VW', model: 'Transporter', year: 2019, intent: 'bestill' };
    const result = routeTools(ner, 'VW Transporter 2019 frontrute');
    expect(result[0].tool).toBe('search');
    expect(result[0].params.input).toContain('VW');
    expect(result[0].params.input).toContain('Transporter');
  });

  it('routes knowledge question to faq tool', () => {
    const ner = { intent: 'kunnskap', make: null, regnr: null, vin: null };
    const result = routeTools(ner, 'Hva er forskjellen på OEM og aftermarket?');
    expect(result[0].tool).toBe('faq');
    expect(result[0].params.query).toBe('Hva er forskjellen på OEM og aftermarket?');
  });

  it('routes human request to handoff tool', () => {
    const ner = { intent: 'bestill', make: null, regnr: null, vin: null };
    const result = routeTools(ner, 'Jeg vil snakke med et menneske');
    expect(result[0].tool).toBe('handoff');
    expect(result[0].params.reason).toBe('customer_request');
  });

  it('routes quote request with candidates to buildQuote', () => {
    const ner = { intent: 'bestill', make: 'VW', year: 2019 };
    const candidates = [mockGlass()];
    const result = routeTools(ner, 'Legg i tilbud', { candidates });
    expect(result[0].tool).toBe('buildQuote');
  });

  it('passes position as category to search when available', () => {
    const ner = { regnr: 'SU18018', position: 'frontrute', intent: 'bestill' };
    const result = routeTools(ner, 'SU18018 frontrute');
    expect(result[0].params.category).toBe('frontrute');
  });

  it('returns empty array for greeting (caller handles directly)', () => {
    const ner = { intent: 'uklart', make: null, regnr: null, vin: null };
    const result = routeTools(ner, 'Hei');
    expect(result).toHaveLength(0);
  });

  it('returns handoff for unclear non-greeting input', () => {
    const ner = { intent: 'uklart', make: null, regnr: null, vin: null };
    const result = routeTools(ner, 'Jeg trenger noe til bilen min');
    expect(result[0].tool).toBe('handoff');
    expect(result[0].params.reason).toBe('equipment_unclear');
  });

  it('generates unique IDs for each tool call', () => {
    const ner = { regnr: 'SU18018', intent: 'bestill' };
    const result = routeTools(ner, 'test');
    expect(result[0].id).toBeDefined();
    expect(typeof result[0].id).toBe('string');
  });
});

describe('executeTool — faq', () => {
  it('returns success=true when FAQ matches', async () => {
    const toolCall: ToolCall = {
      tool: 'faq',
      params: { query: 'Hva er OEM?' },
      id: 'test-1',
    };
    const result = await executeTool(toolCall, mockEnv, mockCtx);
    expect(result.tool).toBe('faq');
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('returns success=false when query is too short', async () => {
    const toolCall: ToolCall = {
      tool: 'faq',
      params: { query: 'x' },
      id: 'test-2',
    };
    const result = await executeTool(toolCall, mockEnv, mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No FAQ match');
  });

  it('returns error when query is missing', async () => {
    const toolCall: ToolCall = {
      tool: 'faq',
      params: {},
      id: 'test-3',
    };
    const result = await executeTool(toolCall, mockEnv, mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing query');
  });
});

describe('executeTool — buildQuote', () => {
  it('builds quote from session candidates when no explicit items', async () => {
    const candidate = mockGlass({ price: 4500 });
    const accessories = [mockAccessory({ sku: 'LIM', price: 189, included: true })];
    const toolCall: ToolCall = {
      tool: 'buildQuote',
      params: {},
      id: 'test-4',
    };
    const result = await executeTool(toolCall, mockEnv, mockCtx, {
      candidates: [candidate],
      accessories,
    });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    const draft = result.data as { subtotal: number; total: number };
    expect(draft.subtotal).toBe(4500);
    expect(draft.total).toBe(4689);
  });

  it('returns error when no candidates in session', async () => {
    const toolCall: ToolCall = {
      tool: 'buildQuote',
      params: {},
      id: 'test-5',
    };
    const result = await executeTool(toolCall, mockEnv, mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No candidates');
  });

  it('selects accessories by sku without qty contract', async () => {
    const candidate = mockGlass({ id: 123, price: 3200 });
    const sessionAccessories = [
      mockAccessory({ sku: 'LIM', price: 189 }),
      mockAccessory({ sku: 'KLIPS', price: 89 }),
      mockAccessory({ sku: 'KAL', price: 450 }),
    ];
    const toolCall: ToolCall = {
      tool: 'buildQuote',
      params: {
        items: [
          {
            productId: 123,
            qty: 1,
            accessories: [{ sku: 'LIM' }, { sku: 'KAL' }], // no qty per accessory
          },
        ],
      },
      id: 'test-5b',
    };
    const result = await executeTool(toolCall, mockEnv, mockCtx, {
      candidates: [candidate],
      accessories: sessionAccessories,
    });
    expect(result.success).toBe(true);
    const draft = result.data as { items: Array<{ accessories: Array<{ sku: string }> }> };
    expect(draft.items[0].accessories).toHaveLength(2);
    expect(draft.items[0].accessories.map((a) => a.sku)).toEqual(['LIM', 'KAL']);
  });
});

describe('executeTool — handoff', () => {
  it('returns handoff summary with reason', async () => {
    const toolCall: ToolCall = {
      tool: 'handoff',
      params: { reason: 'no_match', summary: 'Test summary' },
      id: 'test-6',
    };
    const result = await executeTool(toolCall, mockEnv, mockCtx);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    const summary = result.data as { reason: string; summary: string };
    expect(summary.reason).toBe('no_match');
    expect(summary.summary).toBe('Test summary');
  });

  it('auto-generates summary when not provided', async () => {
    const toolCall: ToolCall = {
      tool: 'handoff',
      params: { reason: 'low_confidence' },
      id: 'test-7',
    };
    const result = await executeTool(toolCall, mockEnv, mockCtx, {
      vehicle: { make: 'VW', model: 'Transporter', year: 2019 },
      candidates: [mockGlass()],
    });
    expect(result.success).toBe(true);
    const summary = result.data as { summary: string };
    expect(summary.summary).toContain('VW');
    expect(summary.summary).toContain('Transporter');
  });
});

describe('executeTool — search', () => {
  it('executes search tool and returns structured ToolResult (D1 may error in test)', async () => {
    // Create a mock ExecutionContext with waitUntil
    const mockCtxWithWaitUntil = {
      waitUntil: (_promise: Promise<unknown>) => { /* no-op */ },
      passThroughOnException: () => { /* no-op */ },
    } as ExecutionContext;

    const toolCall: ToolCall = {
      tool: 'search',
      params: { input: 'E001' },
      id: 'test-search-1',
    };
    const result = await executeTool(toolCall, mockEnv, mockCtxWithWaitUntil);
    expect(result.tool).toBe('search');
    expect(result.id).toBe('test-search-1');
    // Either success or graceful failure — both are valid structured responses
    expect(typeof result.success).toBe('boolean');
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });

  it('returns error when search input is missing', async () => {
    const toolCall: ToolCall = {
      tool: 'search',
      params: { category: 'frontrute' },
      id: 'test-search-2',
    };
    const result = await executeTool(toolCall, mockEnv, mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing input');
  });
});

describe('executeTool — unknown tool', () => {
  it('returns error for unknown tool', async () => {
    const toolCall = { tool: 'unknown', params: {}, id: 'test-8' } as ToolCall;
    const result = await executeTool(toolCall, mockEnv, mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });
});

describe('generateResponseFromToolResults', () => {
  it('generates search success response', () => {
    const results = [{
      tool: 'search' as const,
      id: 'r1',
      success: true,
      data: { searchResult: { ok: true, results: [{}, {}, {}] } },
    }];
    const response = generateResponseFromToolResults(results, {
      vehicle: { make: 'VW', model: 'Transporter', year: 2019 },
    });
    expect(response).toContain('fant 3 glass');
    expect(response).toContain('VW Transporter (2019)');
  });

  it('generates faq response with answer text', () => {
    const results = [{
      tool: 'faq' as const,
      id: 'r2',
      success: true,
      data: { answer: 'OEM er originalt glass.' },
    }];
    const response = generateResponseFromToolResults(results);
    expect(response).toBe('OEM er originalt glass.');
  });

  it('generates buildQuote response with total', () => {
    const results = [{
      tool: 'buildQuote' as const,
      id: 'r3',
      success: true,
      data: { items: [{}], total: 4689 },
    }];
    const response = generateResponseFromToolResults(results);
    expect(response).toContain('tilbudskladden');
    expect(response).toContain('total');
    expect(response).toContain('kr.');
  });

  it('generates handoff response', () => {
    const results = [{
      tool: 'handoff' as const,
      id: 'r4',
      success: true,
      data: { reason: 'customer_request', summary: 'Test' },
    }];
    const response = generateResponseFromToolResults(results);
    expect(response).toContain('overfører');
  });

  it('returns fallback for empty results', () => {
    const response = generateResponseFromToolResults([]);
    expect(response).toContain('forstod ikke helt');
  });

  it('includes error message for failed tool', () => {
    const results = [{
      tool: 'search' as const,
      id: 'r5',
      success: false,
      error: 'DB timeout',
    }];
    const response = generateResponseFromToolResults(results);
    expect(response).toContain('noe gikk galt');
    expect(response).toContain('DB timeout');
  });
});

describe('determineStatusFromTools', () => {
  it('returns knowledge for faq', () => {
    expect(determineStatusFromTools([{ tool: 'faq', id: '1', success: true }])).toBe('knowledge');
  });

  it('returns order_ready for buildQuote', () => {
    expect(determineStatusFromTools([{ tool: 'buildQuote', id: '2', success: true }])).toBe('order_ready');
  });

  it('returns escalated for customer_request handoff', () => {
    expect(determineStatusFromTools([{ tool: 'handoff', id: '3', success: true, data: { reason: 'customer_request' } }])).toBe('escalated');
  });

  it('returns clarification for equipment_unclear handoff', () => {
    expect(determineStatusFromTools([{ tool: 'handoff', id: '4', success: true, data: { reason: 'equipment_unclear' } }])).toBe('clarification');
  });

  it('returns recommendation for successful search with results and confidence', () => {
    expect(determineStatusFromTools([{
      tool: 'search',
      id: '5',
      success: true,
      data: { searchResult: { ok: true, results: [{}, {}], confidence: { level: 'high' } } },
    }])).toBe('recommendation');
  });

  it('returns clarification for failed search', () => {
    expect(determineStatusFromTools([{ tool: 'search', id: '6', success: false }])).toBe('clarification');
  });

  it('returns clarification for empty results', () => {
    expect(determineStatusFromTools([])).toBe('clarification');
  });

  // Regression: search ok=true but results=[] must be clarification, not recommendation
  it('returns clarification for search with ok=true but empty results', () => {
    expect(determineStatusFromTools([{
      tool: 'search',
      id: '7',
      success: true,
      data: { searchResult: { ok: true, results: [], confidence: { level: 'none' } } },
    }])).toBe('clarification');
  });

  // Regression: search ok=true + results + none confidence must be clarification
  it('returns clarification for search with confidence=none despite results', () => {
    expect(determineStatusFromTools([{
      tool: 'search',
      id: '8',
      success: true,
      data: { searchResult: { ok: true, results: [{}], confidence: { level: 'none' } } },
    }])).toBe('clarification');
  });
});

describe('synthesizeSearchToolResult', () => {
  it('synthesizes search result from existing candidates without external call', () => {
    const candidates = [mockGlass({ id: 1, brand: 'VW', model: 'Transporter', price: 3200 })];
    const toolCall: ToolCall = {
      tool: 'search',
      params: { input: 'SU18018' },
      id: 'synth-1',
    };
    const result = synthesizeSearchToolResult(
      toolCall,
      candidates,
      { make: 'VW', model: 'Transporter', year: 2019 },
      0.85
    );
    expect(result.tool).toBe('search');
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    const data = result.data as { searchResult: { results: unknown[]; ok: boolean } };
    expect(data.searchResult.ok).toBe(true);
    expect(data.searchResult.results).toHaveLength(1);
  });

  it('synthesizes no-match result when candidates are empty', () => {
    const toolCall: ToolCall = {
      tool: 'search',
      params: { input: 'SU18018' },
      id: 'synth-2',
    };
    const result = synthesizeSearchToolResult(toolCall, []);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Ingen glass funnet');
  });

  it('uses vehicleInfo for response text, not generic "bilen din"', () => {
    const candidates = [mockGlass()];
    const toolCall: ToolCall = {
      tool: 'search',
      params: { input: 'SU18018' },
      id: 'synth-3',
    };
    const result = synthesizeSearchToolResult(
      toolCall,
      candidates,
      { make: 'VW', model: 'Transporter', year: 2019 },
      0.85
    );
    const response = generateResponseFromToolResults([result], {
      vehicle: { make: 'VW', model: 'Transporter', year: 2019 },
    });
    expect(response).toContain('VW Transporter (2019)');
    expect(response).not.toContain('bilen din');
  });
});

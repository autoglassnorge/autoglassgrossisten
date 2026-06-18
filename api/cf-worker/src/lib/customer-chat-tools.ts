import type { Env, GlassRecord } from '../types';
import { searchByRegnr } from '../handlers/search';
import { handleVinLookup } from '../vin-lookup-api';
import {
  queryByEurocode,
  queryBySupplierSku,
  queryByOemNumber,
  queryByBrandAndYear,
  queryByKtype,
} from './db';
import { normalizeRecord } from './normalize';
import { normalizeRegnr, normalizeVin } from './input-detector';
import type { UserEquipmentAnswers } from './equipment';
import { createHandoff } from './customer-chat-session';
import type {
  ChatToolCall,
  SearchGlassParams,
  ExplainDifferencesParams,
  AskCustomerParams,
  HandoverToHumanParams,
  GlassSearchToolResult,
} from './customer-chat-types';

export interface ToolContext {
  sessionId: number;
  context?: ExecutionContext;
  equipmentAnswers?: Record<string, string>;
}

export async function executeTool(
  env: Env,
  call: ChatToolCall,
  ctx?: ToolContext
): Promise<unknown> {
  switch (call.tool) {
    case 'searchGlass':
      return executeSearchGlass(env, call.params, ctx);
    case 'explainDifferences':
      return executeExplainDifferences(env, call.params);
    case 'askCustomer':
      return executeAskCustomer(call.params);
    case 'handoverToHuman':
      return executeHandoverToHuman(env, call.params, ctx);
    default:
      return { ok: false, error: 'Unknown tool' };
  }
}

export async function executeSearchGlass(
  env: Env,
  params: SearchGlassParams,
  ctx?: ToolContext
): Promise<GlassSearchToolResult> {
  const { regnr, vin, eurocode, make, model, year, position, equipment } = params;

  if (regnr) {
    const normalized = normalizeRegnr(regnr);
    const result = await searchByRegnr(
      normalized,
      env,
      position ?? undefined,
      equipment as UserEquipmentAnswers | undefined
    );
    if (result.httpStatus !== 200) {
      const body = (result.body ?? {}) as { error?: string };
      return {
        ok: false,
        vehicle: null,
        candidates: [],
        confidence: 0,
        reasons: [body.error ?? `lookup failed with status ${result.httpStatus}`],
      };
    }
    const body = (result.body ?? {}) as {
      vehicle?: { make: string; model: string; year: number };
      candidates?: GlassRecord[];
      confidence?: number;
      reasons?: string[];
    };
    return {
      ok: true,
      vehicle: body.vehicle ?? null,
      candidates: (body.candidates ?? []).map(normalizeRecord).slice(0, 10),
      confidence: body.confidence ?? 0,
      reasons: body.reasons ?? ['regnr exact'],
    };
  }

  if (vin) {
    if (!ctx?.context) {
      return {
        ok: false,
        vehicle: null,
        candidates: [],
        confidence: 0,
        reasons: ['ExecutionContext required for VIN lookup'],
      };
    }
    const normalized = normalizeVin(vin);
    const request = new Request('http://example.com/api/vin-lookup', {
      method: 'POST',
      body: JSON.stringify({ vin: normalized }),
    });
    const response = await handleVinLookup(request, env, ctx.context);
    const body = (await response.json()) as {
      status: string;
      vehicle?: { make: string; model: string; year: number };
      match?: { ktype?: number; eurocode?: string; confidence: number; source: string };
      error?: string;
    };
    if (body.status !== 'resolved' || !body.match) {
      return { ok: false, vehicle: body.vehicle ?? null, candidates: [], confidence: 0, reasons: [body.error ?? 'vin unresolved'] };
    }
    let candidates: GlassRecord[] = [];
    if (body.match.eurocode) {
      const record = await queryByEurocode(env.GLASS_CATALOG_D1, body.match.eurocode);
      if (record) candidates = [record];
    }
    if (candidates.length === 0 && body.match.ktype) {
      candidates = await queryByKtype(env.GLASS_CATALOG_D1, body.match.ktype);
    }
    return {
      ok: candidates.length > 0,
      vehicle: body.vehicle ?? null,
      candidates: candidates.map(normalizeRecord).slice(0, 10),
      confidence: body.match.confidence,
      reasons: [body.match.source],
    };
  }

  if (eurocode) {
    const record = await queryByEurocode(env.GLASS_CATALOG_D1, eurocode);
    return {
      ok: !!record,
      vehicle: null,
      candidates: record ? [normalizeRecord(record)] : [],
      confidence: record ? 1 : 0,
      reasons: record ? ['eurocode exact'] : ['no match'],
    };
  }

  if (make && model && year) {
    const records = await queryByBrandAndYear(env.GLASS_CATALOG_D1, make, year, model);
    const filtered = position
      ? records.filter((r) => (r.category || '').toLowerCase() === position.toLowerCase())
      : records;
    return {
      ok: filtered.length > 0,
      vehicle: { make, model, year },
      candidates: filtered.map(normalizeRecord).slice(0, 10),
      confidence: filtered.length > 0 ? 0.7 : 0,
      reasons: ['make/model/year lookup'],
    };
  }

  return { ok: false, vehicle: null, candidates: [], confidence: 0, reasons: ['insufficient params'] };
}

export async function executeExplainDifferences(
  env: Env,
  params: ExplainDifferencesParams
): Promise<{ ok: boolean; summary: string; diff: string[] }> {
  const { candidate_ids } = params;
  if (candidate_ids.length < 2) {
    return { ok: false, summary: 'Trenger minst to produkter for å sammenligne.', diff: [] };
  }
  const records: GlassRecord[] = [];
  for (const id of candidate_ids.slice(0, 4)) {
    const row = await env.GLASS_CATALOG_D1
      .prepare('SELECT * FROM glass_catalog WHERE id = ?')
      .bind(id)
      .first<GlassRecord>();
    if (row) records.push(row);
  }
  if (records.length < 2) {
    return { ok: false, summary: 'Kunne ikke finne alle kandidatene.', diff: [] };
  }
  const diff: string[] = records.map((r) => {
    const brand = r.brand || 'Ukjent';
    const price = r.price ? `${r.price} kr` : 'Pris på forespørsel';
    const features = [
      r.adas ? 'ADAS' : '',
      r.heated ? 'varme' : '',
      r.rain_sensor ? 'regnsensor' : '',
      r.acoustic ? 'akustisk' : '',
      r.hud ? 'HUD' : '',
    ]
      .filter(Boolean)
      .join(', ');
    return `${brand}: ${price}${features ? ` — ${features}` : ''}`;
  });
  const oem = records.find((r) => (r.source || '').toLowerCase().includes('oem'));
  const aftermarket = records.find((r) => !(r.source || '').toLowerCase().includes('oem'));
  const summary = oem && aftermarket
    ? 'OEM-glasset har original kvalitet/logo. Aftermarket-alternativet er rimeligere og dekker samme funksjon.'
    : 'Hovedforskjellene er merke, pris og utstyr. Se tabellen under.';
  return { ok: true, summary, diff };
}

export function executeAskCustomer(params: AskCustomerParams): AskCustomerParams {
  return params;
}

export async function executeHandoverToHuman(
  env: Env,
  params: HandoverToHumanParams,
  ctx?: ToolContext
): Promise<{ ok: boolean; handoffId?: number; reason: string; summary: string }> {
  if (!ctx?.sessionId) {
    return { ok: false, reason: params.reason, summary: params.summary };
  }
  const handoffId = await createHandoff(env, ctx.sessionId, params.reason, params.summary, params.preferred_contact);
  return { ok: true, handoffId, reason: params.reason, summary: params.summary };
}

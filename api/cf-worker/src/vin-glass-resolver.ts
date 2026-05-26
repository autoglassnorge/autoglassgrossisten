/**
 * vin-glass-resolver.ts
 * Hybrid VIN → Glass/KType resolution service for Cloudflare D1
 *
 * Lag:
 *   1. Gratis: D1 cache → vPIC fallback
 *   2. Intern: D1 glass_rules (statistisk læring)
 *   3. Betalt fallback:
 *      3a. Vincario (EU VIN-decode, vehicle enrichment) — freemium
 *      3b. MACS VIS (EU/KType) — krever egen nøkkel
 *      3c. AutoGlassMatch (US/NAGS) — krever egen nøkkel
 *      (RapidAPI Autoways fjernet 2026-05-21 — se docs/RAPIDAPI-AUTOWAYS-PORTFOLIO.md)
 *
 * Bruk fra Worker:
 *   import { resolveGlass, upsertGlassRule } from './vin-glass-resolver';
 *   const result = await resolveGlass({ db, vin: 'WVW...', opening: 'windshield', market: 'EU' });
 *
 * MERK: RapidAPI Autoways er fjernet fra RapidAPI (HTTP 404).
 *       glass_rules (D1) er nå primær kilde for kType-oppslag.
 *       Se docs/RAPIDAPI-AUTOWAYS-PORTFOLIO.md for historikk.
 */

export type GlassOpening =
  | 'windshield'
  | 'backglass'
  | 'door_glass_left_front'
  | 'door_glass_right_front'
  | 'door_glass_left_rear'
  | 'door_glass_right_rear'
  | 'quarter_glass_left'
  | 'quarter_glass_right';

export type Market = 'EU' | 'US' | 'NO';
export type ResolveMode = 'auto' | 'free_only' | 'paid_only';

export interface EquipmentFeatures {
  camera?: boolean;
  hud?: boolean;
  rainSensor?: boolean;
  heated?: boolean;
  acoustic?: boolean;
}

export interface ResolveGlassRequest {
  db: D1Database;
  vin: string;
  opening: GlassOpening;
  market?: Market;
  features?: EquipmentFeatures;
  mode?: ResolveMode;
  // Optional: regnr for APIs that support license plate lookup
  regnr?: string;
  // Optional: vehicle make/model for Car Selector fallback
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  // Optional API keys (Lag 3 fallbacks)
  rapidApiKey?: string;           // DEPRECATED: RapidAPI Autoways fjernet 2026-05-21
  vincarioApiKey?: string;        // Vincario API key
  vincarioSecretKey?: string;     // Vincario secret key
  macsVisApiKey?: string;         // MACS VIS API key
  macsVisMockMode?: boolean;       // MACS VIS mock-modus (for testing uten API-nøkkel)
  agmApiKey?: string;             // AutoGlassMatch API key
}

export interface GlassMatch {
  ktype?: number;
  kba?: string;
  nags?: string;
  oemPartNumber?: string;
  eurocode?: string;
  confidence: number;
  source: string;
}

export interface ResolveGlassResponse {
  requestId: number;
  status: 'resolved' | 'needs_review' | 'failed';
  resolutionPath: string[];
  paidLookupUsed: boolean;
  match?: GlassMatch;
  providerCost?: number;
}

interface VinDecodeCache {
  vin: string;
  market: string;
  source: string;
  make: string | null;
  model: string | null;
  year: number | null;
  body_style: string | null;
  doors: number | null;
  engine_type: string | null;
  drive_type: string | null;
  raw_payload: string;
  normalized_key: string | null;
  confidence: number;
  expires_at: string;
}

import { decodeVinVincario, type VincarioConfig } from './providers/vincario';

// ---------------------------------------------------------------------------
// RapidAPI Autoways — PERMANENTLY REMOVED (HTTP 404, 2026-05-21)
// Alle hosts nedenfor er døde. Beholdes som dokumentasjon i kommentarer.
// K_TYPE_FINDER_HOST = 'ktype-finder-tecdoc.p.rapidapi.com' [DEAD]
// VIN_DECODER_TECDOC_HOST = 'vin-decoder-support-tecdoc-catalog.p.rapidapi.com' [DEAD]
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Konfidensterskler
// ---------------------------------------------------------------------------
const THRESHOLD_ACCEPT = 0.90;
const THRESHOLD_RULES = 0.85;
const THRESHOLD_PAID = 0.60;

// ---------------------------------------------------------------------------
// Hoved-funksjon
// ---------------------------------------------------------------------------
export async function resolveGlass(req: ResolveGlassRequest): Promise<ResolveGlassResponse> {
  const {
    db,
    vin,
    opening,
    market = 'EU',
    features = {},
    mode = 'auto',
    regnr,
    vehicleMake,
    vehicleModel,
    vehicleYear,
    rapidApiKey,
    vincarioApiKey,
    vincarioSecretKey,
    macsVisApiKey,
    macsVisMockMode,
    agmApiKey,
  } = req;

  // For UK/FR regnr: RapidAPI Autoways er fjernet (HTTP 404, 2026-05-21)
  // Se docs/RAPIDAPI-AUTOWAYS-PORTFOLIO.md for historikk
  const resolvedVin = vin;
  const resolvedMake = vehicleMake ?? null;
  const resolvedModel = vehicleModel ?? null;
  const resolvedYear = vehicleYear ?? null;

  // DISABLED: UK/FR regnr lookup via RapidAPI Autoways
  // if (regnr && rapidApiKey) {
  //   const regnrFormat = detectRegnrFormat(regnr);
  //   ...
  // }

  validateVin(resolvedVin);

  const featureSig = buildFeatureSignature(opening, features);
  const path: string[] = [];

  // Opprett request i DB
  const requestId = await createResolutionRequest(db, {
    vin: resolvedVin, opening, market, mode, features, featureSig,
  });

  try {
    // -----------------------------------------------------------------------
    // LAG 1: Gratis VIN-dekode
    //   1a. D1 cache
    //   1b. Autoways VIN Decoder (RapidAPI, bedre enn vPIC for EU)
    //   1c. NHTSA vPIC (gratis fallback)
    // -----------------------------------------------------------------------
    const vehicle = await decodeVin(db, resolvedVin, market, rapidApiKey);
    path.push(vehicle.source);

    // Prefer SVV/authoritative source data over vPIC for EU vehicles
    // vPIC is US-focused and often returns wrong year/model for EU cars
    const trustedMake = vehicleMake ?? vehicle.make ?? null;
    const trustedModel = vehicleModel ?? vehicle.model ?? null;
    const trustedYear = vehicleYear ?? vehicle.year ?? null;

    const normalizedKey = normalizeVehicleKeyFromParts(trustedMake, trustedModel, trustedYear);

    // -----------------------------------------------------------------------
    // LAG 2: Intern cache/regler
    // -----------------------------------------------------------------------
    if (mode !== 'paid_only') {
      const rule = await lookupRules(db, normalizedKey, market, opening, featureSig);
      if (rule && rule.confidence >= THRESHOLD_RULES) {
        path.push(rule.confidence >= THRESHOLD_ACCEPT ? 'cache' : 'rules');
        const match = toGlassMatch(rule, rule.confidence >= THRESHOLD_ACCEPT ? 'cache' : 'internal_rules');
        await resolveRequest(db, requestId, match, path, false, 0);
        if (rule.confidence < THRESHOLD_ACCEPT) {
          await incrementRuleEvidence(db, rule.id);
        }
        return buildResponse(requestId, 'resolved', path, false, match);
      }
    }

    // -----------------------------------------------------------------------
    // LAG 3: Betalt / freemium fallback
    // -----------------------------------------------------------------------
    if (mode === 'free_only') {
      await queueManualReview(db, requestId, 'low_confidence', 'medium');
      await updateRequestStatus(db, requestId, 'needs_review', path);
      return buildResponse(requestId, 'needs_review', path, false);
    }

    let paidMatch: GlassMatch | null = null;
    let paidCost = 0;

    // --- 3a. Vincario (EU VIN-decode, vehicle enrichment, freemium) ---
    if (vincarioApiKey && vincarioSecretKey && !paidMatch) {
      try {
        const vincResult = await callVincario(vin, {
          apiKey: vincarioApiKey,
          secretKey: vincarioSecretKey,
        }, requestId, db);
        if (vincResult.match) {
          path.push('vincario');
          paidMatch = vincResult.match;
          paidCost = vincResult.cost ?? 0;
        }
      } catch (e) {
        console.warn('[vincario] Feil:', e);
      }
    }

    // --- 3b. MACS VIS (EU/KType, monthly subscription) ---
    if ((macsVisApiKey || macsVisMockMode) && !paidMatch) {
      try {
        const macsResult = await callMacsVis(vin, market, macsVisApiKey, macsVisMockMode, requestId, db);
        if (macsResult.match) {
          path.push(macsVisMockMode ? 'macs_vis_mock' : 'macs_vis');
          paidMatch = macsResult.match;
          paidCost = macsResult.cost ?? 0;
        }
      } catch (e) {
        console.warn('[macs_vis] Feil:', e);
      }
    }

    // --- 3e. AutoGlassMatch (US/NAGS, $1/lookup) ---
    if (market === 'US' && agmApiKey && !paidMatch) {
      try {
        const agmResult = await callAutoGlassMatch(vin, opening, agmApiKey, requestId, db);
        if (agmResult.match) {
          path.push('autoglass_match');
          paidMatch = agmResult.match;
          paidCost = agmResult.cost ?? 1.0;
        }
      } catch (e) {
        console.warn('[autoglass_match] Feil:', e);
      }
    }

    // --- Ingen match fra noen provider ---
    if (!paidMatch) {
      path.push('no_match');
      await queueManualReview(db, requestId, 'no_match', 'high');
      await updateRequestStatus(db, requestId, 'needs_review', path);
      return buildResponse(requestId, 'needs_review', path, paidCost > 0, null, paidCost);
    }

    // --- Match funnet ---
    if (paidMatch.confidence >= THRESHOLD_PAID) {
      // Lagre verifisert regel for fremtidig gratis treff
      await upsertGlassRule(db, {
        normalizedKey,
        market,
        opening,
        featureSig,
        match: paidMatch,
      });

      await resolveRequest(db, requestId, paidMatch, path, paidCost > 0, paidCost);
      return buildResponse(requestId, 'resolved', path, paidCost > 0, paidMatch, paidCost);
    }

    // Match funnet men lav konfidens
    await queueManualReview(db, requestId, 'low_confidence', 'medium');
    await updateRequestStatus(db, requestId, 'needs_review', path);
    return buildResponse(requestId, 'needs_review', path, paidCost > 0, paidMatch, paidCost);

  } catch (err) {
    console.error('[vin-glass-resolver] Feil:', err);
    await updateRequestStatus(db, requestId, 'failed', path);
    return buildResponse(requestId, 'failed', path, false);
  }
}

// ---------------------------------------------------------------------------
// LAG 1: VIN-dekoding (D1 cache → Autoways → vPIC)
// ---------------------------------------------------------------------------
const VPIC_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles';

async function decodeVin(
  db: D1Database,
  vin: string,
  market: string,
  rapidApiKey?: string
): Promise<VinDecodeCache> {
  const t0 = Date.now();

  // 1a. Sjekk D1-cache først
  const cached = await db
    .prepare("SELECT * FROM vin_decode_cache WHERE vin = ? AND expires_at > datetime('now')")
    .bind(vin)
    .first<VinDecodeCache>();

  if (cached) return cached;

  // 1b. Autoways VIN Decoder (RapidAPI) — DISABLED: fjernet fra RapidAPI 2026-05-21
  // if (rapidApiKey) {
  //   try {
  //     const awVehicle = await callAutowaysVinDecoder(vin, rapidApiKey);
  //     ...
  //   } catch (e) { /* Fallback til vPIC */ }
  // }

  // 1c. Fallback: NHTSA vPIC (gratis, US-biler primært)
  const url = `${VPIC_URL}/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`vPIC feilet: ${res.status}`);
  const json = await res.json() as { Results?: Array<Record<string, string>> };
  const v = json.Results?.[0] ?? {};

  const latency = Date.now() - t0;
  const make = v.Make || null;
  const model = v.Model || null;
  const year = v.ModelYear ? parseInt(v.ModelYear) : null;
  const bodyStyle = v.BodyClass || null;
  const doors = v.Doors ? parseInt(v.Doors) : null;

  const normalizedKey = normalizeVehicleKeyFromParts(make, model, year, bodyStyle, doors);

  const vehicle: VinDecodeCache = {
    vin,
    market,
    source: 'vpic',
    make,
    model,
    year,
    body_style: bodyStyle,
    doors,
    engine_type: v.FuelTypePrimary || null,
    drive_type: v.DriveType || null,
    raw_payload: JSON.stringify(v),
    normalized_key: normalizedKey,
    confidence: make && model && year ? 0.75 : 0.40,
    expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
  };

  await upsertVinCache(db, vehicle);
  await logProviderCall(db, null, 'vpic', 'decode_vin', true, res.status, latency, 0, { make, model, year });

  return vehicle;
}

// ---------------------------------------------------------------------------
// LAG 2: glass_rules oppslag
// ---------------------------------------------------------------------------
interface GlassRuleRow {
  id: number;
  normalized_key: string;
  market: string;
  opening: string;
  feature_signature: string;
  ktype: number | null;
  kba: string | null;
  nags: string | null;
  oem_part_number: string | null;
  eurocode: string | null;
  confidence: number;
  evidence_count: number;
  active: number;
}

async function lookupRules(
  db: D1Database,
  normalizedKey: string,
  market: string,
  opening: string,
  featureSig: string
): Promise<GlassRuleRow | null> {
  const { results } = await db.prepare(`
    SELECT * FROM glass_rules
    WHERE normalized_key = ? AND market = ? AND opening = ?
      AND feature_signature IN (?, 'default')
      AND active = 1
    ORDER BY confidence DESC, evidence_count DESC
    LIMIT 1
  `).bind(normalizedKey, market, opening, featureSig).all<GlassRuleRow>();

  return results?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// LAG 3b: MACS VIS (EU/KType)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// MACS VIS Mock Database — kjente VIN → kType for testing uten API-nøkkel
// ---------------------------------------------------------------------------
const MACS_VIS_MOCK_DB: Record<string, { ktype: number; kba?: string; confidence: number }> = {
  // Bovsoft-verifiserte mappings (seedet 2026-05-21)
  'TMBJE73T7B9015131': { ktype: 32787, confidence: 0.95 },   // Skoda Superb II
  'YYCFT26B38J005067': { ktype: 12152, confidence: 0.95 },   // Think City
  'W0VZ45GB7MS073060': { ktype: 136486, confidence: 0.95 },  // Opel Grandland X
  'VF33BNFUC83502899': { ktype: 18550, confidence: 0.95 },   // Peugeot 307 CC
};

async function callMacsVis(
  vin: string,
  market: string,
  apiKey: string | undefined,
  mockMode: boolean | undefined,
  requestId: number,
  db: D1Database
): Promise<{ match: GlassMatch | null; cost: number }> {
  const t0 = Date.now();
  let responseJson: unknown = null;
  let success = false;
  let httpStatus = 0;

  // ── MOCK-MODUS: Returner kjente VIN-er uten API-kall ──
  if (mockMode) {
    const mockEntry = MACS_VIS_MOCK_DB[vin.toUpperCase()];
    if (mockEntry) {
      responseJson = { mock: true, vin, ktypes: [{ ktype: mockEntry.ktype, probability: mockEntry.confidence }] };
      success = true;
      httpStatus = 200;
      await logProviderCall(db, requestId, 'macs_vis_mock', 'resolve_glass', true, 200, Date.now() - t0, 0, responseJson);
      return {
        match: {
          ktype: mockEntry.ktype,
          kba: mockEntry.kba,
          confidence: mockEntry.confidence,
          source: 'macs_vis_mock',
        },
        cost: 0,
      };
    }
    // VIN ikke i mock-databasen — logg og returner null
    responseJson = { mock: true, vin, found: false };
    await logProviderCall(db, requestId, 'macs_vis_mock', 'resolve_glass', false, 404, Date.now() - t0, 0, responseJson);
    return { match: null, cost: 0 };
  }

  // ── LIVE-MODUS: Kall MACS VIS API ──
  const MACS_VIS_URL = 'https://api.macsds.com/vis/v1';
  try {
    const res = await fetch(`${MACS_VIS_URL}/vin/${encodeURIComponent(vin)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    httpStatus = res.status;
    responseJson = await res.json().catch(() => null);
    success = res.ok;

    if (!res.ok) throw new Error(`MACS VIS feilet: ${res.status}`);

    const candidates = (responseJson as any)?.ktypes ?? (responseJson as any)?.results ?? [];
    const best = candidates
      .sort((a: any, b: any) => (b.probability ?? 0) - (a.probability ?? 0))[0];

    const match: GlassMatch | null = best ? {
      ktype: parseInt(String(best.ktype ?? best.kType ?? '0')) || undefined,
      kba: best.kba ?? undefined,
      confidence: Number(best.probability ?? 0.80),
      source: 'macs_vis',
    } : null;

    if (candidates.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO glass_match_candidates
          (request_id, source, ktype, kba, confidence, rank_, raw_payload, accepted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < Math.min(candidates.length, 5); i++) {
        const c = candidates[i];
        await stmt.bind(
          requestId, 'macs_vis',
          parseInt(String(c.ktype ?? c.kType ?? '0')) || null,
          c.kba ?? null,
          Number(c.probability ?? 0),
          i + 1,
          JSON.stringify(c),
          i === 0 && !!best ? 1 : 0
        ).run();
      }
    }

    return { match, cost: 0 };

  } finally {
    await logProviderCall(db, requestId, 'macs_vis', 'resolve_glass', success, httpStatus, Date.now() - t0, 0, responseJson);
  }
}

// ---------------------------------------------------------------------------
// LAG 3e: AutoGlassMatch (US/NAGS)
// ---------------------------------------------------------------------------
async function callAutoGlassMatch(
  vin: string,
  opening: string,
  apiKey: string,
  requestId: number,
  db: D1Database
): Promise<{ match: GlassMatch | null; cost: number }> {
  const t0 = Date.now();
  const AGM_URL = 'https://api.autoglassmatch.com/v1';
  const COST_PER_LOOKUP = 1.0;

  let responseJson: unknown = null;
  let success = false;
  let httpStatus = 0;

  try {
    const res = await fetch(`${AGM_URL}/lookup`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ vin, opening }),
    });

    httpStatus = res.status;
    responseJson = await res.json().catch(() => null);
    success = res.ok;

    if (!res.ok) throw new Error(`AutoGlassMatch feilet: ${res.status}`);

    const parts = (responseJson as any)?.parts ?? (responseJson as any)?.results ?? [];
    const best = parts[0];

    const match: GlassMatch | null = best ? {
      nags: best.nagsPartNumber ?? best.nags ?? undefined,
      oemPartNumber: best.oemPartNumber ?? undefined,
      eurocode: best.eurocode ?? undefined,
      confidence: Number(best.confidence ?? 0.85),
      source: 'autoglass_match',
    } : null;

    if (parts.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO glass_match_candidates
          (request_id, source, nags, oem_part_number, confidence, rank_, raw_payload, accepted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < Math.min(parts.length, 5); i++) {
        const p = parts[i];
        await stmt.bind(
          requestId, 'autoglass_match',
          p.nagsPartNumber ?? p.nags ?? null,
          p.oemPartNumber ?? null,
          Number(p.confidence ?? 0),
          i + 1,
          JSON.stringify(p),
          i === 0 && !!best ? 1 : 0
        ).run();
      }
    }

    return { match, cost: success ? COST_PER_LOOKUP : 0 };

  } finally {
    await logProviderCall(db, requestId, 'autoglass_match', 'resolve_glass', success, httpStatus, Date.now() - t0, success ? COST_PER_LOOKUP : 0, responseJson, 'USD');
  }
}

// ---------------------------------------------------------------------------
// LAG 3a: Vincario (EU VIN-decode, vehicle enrichment)
// ---------------------------------------------------------------------------
async function callVincario(
  vin: string,
  config: VincarioConfig,
  requestId: number,
  db: D1Database
): Promise<{ match: GlassMatch | null; cost: number }> {
  const t0 = Date.now();
  let responseJson: Record<string, unknown> | null = null;
  let success = false;
  let httpStatus = 0;
  const COST_PER_LOOKUP = 0.22; // €0.22 per VIN at 5k tier

  try {
    const result = await decodeVinVincario(vin, config);
    httpStatus = result.httpStatus;
    success = result.httpStatus === 200;
    responseJson = result.vehicle?.raw ?? null;

    if (!result.vehicle) {
      return { match: null, cost: 0 };
    }

    // Vincario returns vehicle specs, NOT kType directly.
    // We use it for high-confidence vehicle enrichment.
    // If MACS VIS is also configured, the resolver will try that next for kType.
    const match: GlassMatch = {
      confidence: 0.75, // Vincario confirms identity but doesn't give kType
      source: 'vincario',
    };

    return { match, cost: success ? COST_PER_LOOKUP : 0 };

  } catch (err) {
    console.warn('[vincario] Exception:', err);
    return { match: null, cost: 0 };
  } finally {
    await db.prepare(
      `INSERT INTO provider_calls
        (request_id, provider, operation, success, http_status, latency_ms, cost_amount, cost_currency, response_payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      requestId,
      'vincario',
      'decode_vin',
      success ? 1 : 0,
      httpStatus,
      Date.now() - t0,
      success ? COST_PER_LOOKUP : 0,
      'EUR',
      responseJson ? JSON.stringify(responseJson) : null
    ).run();
  }
}

// ---------------------------------------------------------------------------
// DB-hjelpere
// ---------------------------------------------------------------------------
async function createResolutionRequest(
  db: D1Database,
  params: { vin: string; opening: string; market: string; mode: string; features: EquipmentFeatures; featureSig: string }
): Promise<number> {
  const result = await db.prepare(`
    INSERT INTO glass_resolution_requests
      (vin, opening, market, mode, features, feature_signature, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).bind(
    params.vin, params.opening, params.market, params.mode,
    JSON.stringify(params.features), params.featureSig
  ).run();

  return result.meta?.last_row_id ?? 0;
}

async function resolveRequest(
  db: D1Database,
  requestId: number,
  match: GlassMatch,
  path: string[],
  paidUsed: boolean,
  cost: number
): Promise<void> {
  await db.prepare(`
    UPDATE glass_resolution_requests SET
      status = 'resolved',
      resolution_path = ?,
      paid_lookup_used = ?,
      provider_cost = ?,
      resolved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(JSON.stringify(path), paidUsed ? 1 : 0, cost, requestId).run();
}

async function updateRequestStatus(
  db: D1Database,
  requestId: number,
  status: string,
  path: string[]
): Promise<void> {
  await db.prepare(`
    UPDATE glass_resolution_requests SET
      status = ?,
      resolution_path = ?,
      resolved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(status, JSON.stringify(path), requestId).run();
}

async function queueManualReview(
  db: D1Database,
  requestId: number,
  reason: string,
  severity: string
): Promise<void> {
  await db.prepare(`
    INSERT INTO provider_calls
      (request_id, provider, operation, success, error_message)
    VALUES (?, ?, ?, ?, ?)
  `).bind(requestId, 'manual_review', 'queue', 0, `${reason}:${severity}`).run();
}

async function incrementRuleEvidence(db: D1Database, ruleId: number): Promise<void> {
  await db.prepare(`
    UPDATE glass_rules SET
      evidence_count = evidence_count + 1,
      last_verified_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(ruleId).run();
}

export async function upsertGlassRule(
  db: D1Database,
  params: {
    normalizedKey: string;
    market: string;
    opening: string;
    featureSig: string;
    match: GlassMatch;
  }
): Promise<void> {
  const { normalizedKey, market, opening, featureSig, match } = params;

  await db.prepare(`
    INSERT INTO glass_rules
      (normalized_key, market, opening, feature_signature, ktype, kba, nags,
       oem_part_number, eurocode, confidence, evidence_count, active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
      ktype = COALESCE(excluded.ktype, glass_rules.ktype),
      kba = COALESCE(excluded.kba, glass_rules.kba),
      nags = COALESCE(excluded.nags, glass_rules.nags),
      oem_part_number = COALESCE(excluded.oem_part_number, glass_rules.oem_part_number),
      eurocode = COALESCE(excluded.eurocode, glass_rules.eurocode),
      confidence = MAX(excluded.confidence, glass_rules.confidence),
      evidence_count = glass_rules.evidence_count + 1,
      last_verified_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP,
      active = 1
  `).bind(
    normalizedKey, market, opening, featureSig,
    match.ktype ?? null,
    match.kba ?? null,
    match.nags ?? null,
    match.oemPartNumber ?? null,
    match.eurocode ?? null,
    match.confidence
  ).run();
}

// ---------------------------------------------------------------------------
// Seed glass_rules fra ktype_matches + catalog (batch-import)
// ---------------------------------------------------------------------------
// Bruk: Kjør som D1-script eller fra admin-panel. Siden ktype_matches ikke
// har make/model/year, kan denne funksjonen brukes NÅR man har bygget en
// mapping fra kType → vehicle spec (f.eks. fra Bovsoft eller TecDoc).
//
// For nå: Denne funksjonen er en stub som demonstrerer mønsteret.
// Den faktiske implementasjonen krever:
//   1. En ktype → make:model:year mapping (fra Bovsoft/TecDoc)
//   2. ktype_matches data (fra produksjon)
//   3. glass_catalog for kryss-referanse
//
// Se scripts/seed-glass-rules-from-ktype-matches.mjs for Node.js-variant.
// ---------------------------------------------------------------------------
export async function seedGlassRulesFromKtypeMatches(
  db: D1Database,
  ktypeVehicleMap: Map<number, { make: string; model: string; year: number }>,
  options: {
    minHitCount?: number;
    market?: string;
    opening?: string;
    confidence?: number;
  } = {}
): Promise<{ seeded: number; skipped: number; errors: string[] }> {
  const { minHitCount = 1, market = 'EU', opening = 'windshield', confidence = 0.85 } = options;
  const result = { seeded: 0, skipped: 0, errors: [] as string[] };

  // Hent alle ktype_matches med minHitCount
  const { results: matches } = await db.prepare(
    `SELECT ktype, eurocode, hit_count FROM ktype_matches WHERE hit_count >= ?`
  ).bind(minHitCount).all<{ ktype: number; eurocode: string; hit_count: number }>();

  if (!matches || matches.length === 0) {
    result.errors.push('Ingen ktype_matches funnet med minHitCount >= ' + minHitCount);
    return result;
  }

  for (const m of matches) {
    const vehicle = ktypeVehicleMap.get(m.ktype);
    if (!vehicle) {
      result.skipped++;
      continue; // Ingen vehicle-mapping for denne kType
    }

    const normalizedKey = [
      vehicle.make.toLowerCase().trim().replace(/\s+/g, '_'),
      vehicle.model.toLowerCase().trim().replace(/\s+/g, '_'),
      String(vehicle.year),
    ].join(':');

    try {
      await db.prepare(`
        INSERT INTO glass_rules
          (normalized_key, market, opening, feature_signature, ktype, eurocode,
           confidence, evidence_count, active, notes, created_at, updated_at)
        VALUES (?, ?, ?, 'default', ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
        ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
          ktype = COALESCE(excluded.ktype, glass_rules.ktype),
          eurocode = COALESCE(excluded.eurocode, glass_rules.eurocode),
          confidence = MAX(excluded.confidence, glass_rules.confidence),
          evidence_count = glass_rules.evidence_count + 1,
          notes = excluded.notes,
          updated_at = datetime('now')
      `).bind(
        normalizedKey, market, opening,
        m.ktype, m.eurocode,
        confidence, m.hit_count,
        `seeded_from_ktype_matches:hit_count=${m.hit_count}`
      ).run();
      result.seeded++;
    } catch (e: any) {
      result.errors.push(`ktype=${m.ktype}: ${e.message}`);
    }
  }

  return result;
}

async function upsertVinCache(db: D1Database, vehicle: VinDecodeCache): Promise<void> {
  await db.prepare(`
    INSERT INTO vin_decode_cache
      (vin, market, source, make, model, year, body_style, doors, engine_type, drive_type,
       raw_payload, normalized_key, confidence, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(vin) DO UPDATE SET
      market = excluded.market, source = excluded.source, make = excluded.make,
      model = excluded.model, year = excluded.year, body_style = excluded.body_style,
      doors = excluded.doors, engine_type = excluded.engine_type, drive_type = excluded.drive_type,
      raw_payload = excluded.raw_payload, normalized_key = excluded.normalized_key,
      confidence = excluded.confidence, expires_at = excluded.expires_at, decoded_at = CURRENT_TIMESTAMP
  `).bind(
    vehicle.vin, vehicle.market, vehicle.source, vehicle.make, vehicle.model,
    vehicle.year, vehicle.body_style, vehicle.doors, vehicle.engine_type, vehicle.drive_type,
    vehicle.raw_payload, vehicle.normalized_key, vehicle.confidence, vehicle.expires_at
  ).run();
}

async function logProviderCall(
  db: D1Database,
  requestId: number | null,
  provider: string,
  operation: string,
  success: boolean,
  httpStatus: number,
  latencyMs: number,
  cost: number,
  responsePayload: unknown,
  currency?: string
): Promise<void> {
  await db.prepare(`
    INSERT INTO provider_calls
      (request_id, provider, operation, success, http_status, latency_ms, cost_amount, cost_currency, response_payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    requestId,
    provider,
    operation,
    success ? 1 : 0,
    httpStatus,
    latencyMs,
    cost,
    currency ?? null,
    JSON.stringify(responsePayload)
  ).run();
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------
function normalizeVehicleKey(v: VinDecodeCache): string {
  return normalizeVehicleKeyFromParts(v.make, v.model, v.year, v.body_style, v.doors);
}

export function normalizeVehicleKeyFromParts(
  make: string | null,
  model: string | null,
  year: number | null,
  bodyStyle?: string | null,
  doors?: number | null
): string {
  // Match index.ts format: make:model:year (bodyStyle/doors ignored for key)
  // They are stored in the rule for reference but not used in the lookup key
  const parts = [
    (make ?? '').toLowerCase().trim().replace(/\s+/g, '_'),
    (model ?? '').toLowerCase().trim().replace(/\s+/g, '_'),
    String(year ?? 'unknown'),
  ];
  return parts.join(':');
}

function buildFeatureSignature(opening: string, features: EquipmentFeatures = {}): string {
  const bool = (v?: boolean) => (v ? '1' : '0');
  return [
    opening,
    `camera:${bool(features.camera)}`,
    `hud:${bool(features.hud)}`,
    `rain:${bool(features.rainSensor)}`,
    `heated:${bool(features.heated)}`,
    `acoustic:${bool(features.acoustic)}`,
  ].join('|');
}

function toGlassMatch(row: GlassRuleRow, source: string): GlassMatch {
  return {
    ktype: row.ktype ?? undefined,
    kba: row.kba ?? undefined,
    nags: row.nags ?? undefined,
    oemPartNumber: row.oem_part_number ?? undefined,
    eurocode: row.eurocode ?? undefined,
    confidence: Number(row.confidence),
    source,
  };
}

function buildResponse(
  requestId: number,
  status: 'resolved' | 'needs_review' | 'failed',
  path: string[],
  paidLookupUsed: boolean,
  match?: GlassMatch | null,
  cost?: number
): ResolveGlassResponse {
  const resp: ResolveGlassResponse = {
    requestId,
    status,
    resolutionPath: path,
    paidLookupUsed,
  };
  if (match) resp.match = match;
  if (cost && cost > 0) resp.providerCost = cost;
  return resp;
}

function validateVin(vin: string): void {
  if (!vin || typeof vin !== 'string') throw new Error('VIN må være en streng');
  const clean = vin.trim().toUpperCase();
  if (clean.length !== 17) throw new Error(`Ugyldig VIN-lengde: ${clean.length} (forventer 17)`);
  if (/[IOQ]/.test(clean)) throw new Error('VIN inneholder ugyldig tegn (I, O eller Q)');
}

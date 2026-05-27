/**
 * vin-glass-resolver.mjs
 * Hybrid VIN -> Glass/KType resolution service
 *
 * Lag:
 *   1. Gratis: NHTSA vPIC decode
 *   2. Intern: cache + regelmotor
 *   3. Betalt fallback: MACS VIS (EU/KType) eller AutoGlassMatch (NAGS)
 *
 * Bruk:
 *   import { resolveGlass } from './lib/vin-glass-resolver.mjs';
 *   const result = await resolveGlass({ vin: 'WVW...', opening: 'windshield', market: 'EU' });
 */

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Konfigurasjon
// ---------------------------------------------------------------------------
const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_KEY;
const MACS_VIS_URL    = process.env.MACS_VIS_API_URL    || 'https://api.macsds.com/vis/v1';
const MACS_VIS_KEY    = process.env.MACS_VIS_API_KEY;
const AGM_URL         = process.env.AGM_API_URL         || 'https://api.autoglassmatch.com/v1';
const AGM_KEY         = process.env.AGM_API_KEY;
const VPIC_URL        = 'https://vpic.nhtsa.dot.gov/api/vehicles';

// Konfidensterskler
const THRESHOLD_ACCEPT    = 0.90; // auto-accept
const THRESHOLD_RULES     = 0.85; // interne regler OK
const THRESHOLD_PAID      = 0.60; // krev betalt fallback under dette

// ---------------------------------------------------------------------------
// Supabase-klient
// ---------------------------------------------------------------------------
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------------------------
// Typer (JSDoc)
// ---------------------------------------------------------------------------
/**
 * @typedef {Object} ResolveGlassRequest
 * @property {string}  vin
 * @property {'windshield'|'backglass'|'door_glass_left_front'|'door_glass_right_front'|'door_glass_left_rear'|'door_glass_right_rear'} opening
 * @property {'EU'|'US'|'NO'} [market]
 * @property {Object}  [features]
 * @property {boolean} [features.camera]
 * @property {boolean} [features.hud]
 * @property {boolean} [features.rainSensor]
 * @property {boolean} [features.heated]
 * @property {boolean} [features.acoustic]
 * @property {'auto'|'free_only'|'paid_only'} [mode]
 */

/**
 * @typedef {Object} GlassMatch
 * @property {string}  [ktype]
 * @property {string}  [kba]
 * @property {string}  [nags]
 * @property {string}  [oemPartNumber]
 * @property {string}  [eurocode]
 * @property {number}  confidence
 * @property {string}  source
 */

/**
 * @typedef {Object} ResolveGlassResponse
 * @property {string}   requestId
 * @property {'resolved'|'needs_review'|'failed'} status
 * @property {string[]} resolutionPath
 * @property {boolean}  paidLookupUsed
 * @property {GlassMatch} [match]
 * @property {number}   [providerCost]
 */

// ---------------------------------------------------------------------------
// Hoved-funksjon
// ---------------------------------------------------------------------------
/**
 * @param {ResolveGlassRequest} req
 * @returns {Promise<ResolveGlassResponse>}
 */
export async function resolveGlass(req) {
  const {
    vin,
    opening,
    market       = 'EU',
    features     = {},
    mode         = 'auto',
  } = req;

  validateVin(vin);

  const featureSig = buildFeatureSignature(opening, features);
  const path       = [];
  let   totalCost  = 0;

  // Opprett request i DB
  const requestId = await createResolutionRequest({
    vin, opening, market, mode, features, featureSig
  });

  try {
    // -----------------------------------------------------------------------
    // LAG 1: Gratis vPIC decode + intern cache
    // -----------------------------------------------------------------------
    const vehicle = await decodeVin(vin, market);
    path.push('vpic');

    const normalizedKey = normalizeVehicleKey(vehicle);

    // -----------------------------------------------------------------------
    // LAG 2a: Cache-treff?
    // -----------------------------------------------------------------------
    if (mode !== 'paid_only') {
      const cached = await lookupCache(normalizedKey, market, opening, featureSig);
      if (cached && cached.confidence >= THRESHOLD_RULES) {
        path.push('cache');
        const match = toGlassMatch(cached, 'cache');
        await resolveRequest(requestId, match, path, false, 0, cached.id);
        return buildResponse(requestId, 'resolved', path, false, match);
      }
    }

    // -----------------------------------------------------------------------
    // LAG 2b: Internt regeltreff?
    // -----------------------------------------------------------------------
    if (mode !== 'paid_only') {
      const rule = await lookupRules(normalizedKey, market, opening, featureSig);
      if (rule && rule.confidence >= THRESHOLD_RULES) {
        path.push('rules');
        const match = toGlassMatch(rule, 'internal_rules');
        await resolveRequest(requestId, match, path, false, 0, null);
        await incrementRuleEvidence(rule.id);
        return buildResponse(requestId, 'resolved', path, false, match);
      }
    }

    // -----------------------------------------------------------------------
    // LAG 3: Betalt fallback
    // -----------------------------------------------------------------------
    if (mode === 'free_only') {
      // Gratis-only berøk uten match -> needs_review
      await queueManualReview(requestId, 'low_confidence', 'medium');
      await updateRequestStatus(requestId, 'needs_review', path);
      return buildResponse(requestId, 'needs_review', path, false);
    }

    let paidMatch = null;
    let paidCost  = 0;

    if (market === 'US') {
      // AutoGlassMatch for NAGS / US-marked
      const agmResult = await callAutoGlassMatch(vin, opening, requestId);
      path.push('autoglass_match');
      paidCost  = agmResult.cost ?? 1.0;
      paidMatch = agmResult.match;
    } else {
      // MACS VIS for EU/NO - KType/KBA
      const macsResult = await callMacsVis(vin, market, requestId);
      path.push('macs_vis');
      paidCost  = macsResult.cost ?? 0;
      paidMatch = macsResult.match;
    }

    totalCost += paidCost;

    if (paidMatch && paidMatch.confidence >= THRESHOLD_PAID) {
      // Lagre verifisert regel for fremtidig gratis treff
      await upsertRule({
        normalizedKey,
        market,
        opening,
        featureSig,
        match: paidMatch,
      });

      await resolveRequest(requestId, paidMatch, path, true, paidCost, null);
      return buildResponse(requestId, 'resolved', path, true, paidMatch, paidCost);
    }

    // Ingen match funnet
    await queueManualReview(requestId, 'no_match', 'high');
    await updateRequestStatus(requestId, 'needs_review', path);
    return buildResponse(requestId, 'needs_review', path, true, null, paidCost);

  } catch (err) {
    console.error('[vin-glass-resolver] Feil:', err);
    await updateRequestStatus(requestId, 'failed', path);
    return buildResponse(requestId, 'failed', path, false);
  }
}

// ---------------------------------------------------------------------------
// LAG 1: NHTSA vPIC VIN-dekoding (gratis, ingen autentisering)
// ---------------------------------------------------------------------------
async function decodeVin(vin, market) {
  const t0 = Date.now();

  // Sjekk cache først
  const {  cached } = await db
    .from('vin_decode_cache')
    .select('*')
    .eq('vin', vin)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (cached) return cached;

  // Kall vPIC
  const url = `${VPIC_URL}/DecodeVinValues/${vin}?format=json`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`vPIC feilet: ${res.status}`);
  const json = await res.json();
  const v    = json.Results?.[0] ?? {};

  const latency = Date.now() - t0;
  const vehicle = {
    vin,
    market,
    source:        'vpic',
    make:          v.Make        || null,
    model:         v.Model       || null,
    year:          v.ModelYear   ? parseInt(v.ModelYear) : null,
    body_style:    v.BodyClass   || null,
    doors:         v.Doors       ? parseInt(v.Doors)     : null,
    engine_type:   v.FuelTypePrimary || null,
    drive_type:    v.DriveType   || null,
    raw_payload:   v,
    normalized_key: null,
    confidence:    v.Make && v.Model && v.ModelYear ? 0.75 : 0.40,
    expires_at:    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
  };

  vehicle.normalized_key = normalizeVehicleKey(vehicle);

  // Upsert cache
  await db.from('vin_decode_cache').upsert(vehicle, { onConflict: 'vin' });

  // Logg kall
  await db.from('provider_calls').insert({
    provider:         'vpic',
    operation:        'decode_vin',
    success:          true,
    http_status:      res.status,
    latency_ms:       latency,
    cost_amount:      0,
    response_payload: { make: vehicle.make, model: vehicle.model, year: vehicle.year },
  });

  return vehicle;
}

// ---------------------------------------------------------------------------
// LAG 2a: Cache-oppslag mot glass_rules
// ---------------------------------------------------------------------------
async function lookupCache(normalizedKey, market, opening, featureSig) {
  // Søk eksakt match først, deretter 'default' feature signature
  const { data } = await db
    .from('glass_rules')
    .select('*')
    .eq('normalized_key', normalizedKey)
    .eq('market', market)
    .eq('opening', opening)
    .in('feature_signature', [featureSig, 'default'])
    .eq('active', true)
    .order('confidence', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

// ---------------------------------------------------------------------------
// LAG 2b: Regelbasert oppslag (samme tabell, men bruker confidence >= 0.85)
// ---------------------------------------------------------------------------
async function lookupRules(normalizedKey, market, opening, featureSig) {
  return lookupCache(normalizedKey, market, opening, featureSig);
}

// ---------------------------------------------------------------------------
// LAG 3a: MACS VIS (EU/KType)
// ---------------------------------------------------------------------------
async function callMacsVis(vin, market, requestId) {
  const t0 = Date.now();

  if (!MACS_VIS_KEY) {
    console.warn('[macs_vis] Ingen API-nøkkel satt (MACS_VIS_API_KEY). Hopper over.');
    return { match: null, cost: 0 };
  }

  let responseJson = null;
  let success      = false;
  let httpStatus   = 0;

  try {
    const res = await fetch(`${MACS_VIS_URL}/vin/${encodeURIComponent(vin)}`, {
      headers: {
        Authorization: `Bearer ${MACS_VIS_KEY}`,
        Accept:        'application/json',
      },
    });

    httpStatus   = res.status;
    responseJson = await res.json();
    success      = res.ok;

    if (!res.ok) throw new Error(`MACS VIS feilet: ${res.status}`);

    // MACS returnerer en liste med KType-kandidater med sannsynlighet
    const candidates = responseJson.ktypes ?? responseJson.results ?? [];
    const best       = candidates
      .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))
      [0];

    const match = best ? {
      ktype:      String(best.ktype ?? best.kType ?? ''),
      kba:        best.kba ?? null,
      confidence: Number(best.probability ?? 0.80),
      source:     'macs_vis',
    } : null;

    // Lagre kandidater
    if (requestId && candidates.length > 0) {
      await db.from('glass_match_candidates').insert(
        candidates.slice(0, 5).map((c, i) => ({
          request_id:   requestId,
          source:       'macs_vis',
          ktype:        String(c.ktype ?? c.kType ?? ''),
          kba:          c.kba ?? null,
          confidence:   Number(c.probability ?? 0),
          rank:         i + 1,
          raw_payload:  c,
          accepted:     i === 0 && !!best,
        }))
      );
    }

    return { match, cost: 0 }; // MACS fakturerer per måned, ikke per kall

  } finally {
    await db.from('provider_calls').insert({
      request_id:       requestId,
      provider:         'macs_vis',
      operation:        'resolve_glass',
      success,
      http_status:      httpStatus,
      latency_ms:       Date.now() - t0,
      cost_amount:      0,
      response_payload: responseJson,
    });
  }
}

// ---------------------------------------------------------------------------
// LAG 3b: AutoGlassMatch (US/NAGS)
// ---------------------------------------------------------------------------
async function callAutoGlassMatch(vin, opening, requestId) {
  const t0 = Date.now();

  if (!AGM_KEY) {
    console.warn('[autoglass_match] Ingen API-nøkkel satt (AGM_API_KEY). Hopper over.');
    return { match: null, cost: 0 };
  }

  let responseJson = null;
  let success      = false;
  let httpStatus   = 0;
  const COST_PER_LOOKUP = 1.0;

  try {
    const res = await fetch(`${AGM_URL}/lookup`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${AGM_KEY}`,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
      body: JSON.stringify({ vin, opening }),
    });

    httpStatus   = res.status;
    responseJson = await res.json();
    success      = res.ok;

    if (!res.ok) throw new Error(`AutoGlassMatch feilet: ${res.status}`);

    const parts = responseJson.parts ?? responseJson.results ?? [];
    const best  = parts[0];

    const match = best ? {
      nags:           best.nagsPartNumber ?? best.nags ?? null,
      oemPartNumber:  best.oemPartNumber  ?? null,
      eurocode:       best.eurocode       ?? null,
      confidence:     Number(best.confidence ?? 0.85),
      source:         'autoglass_match',
    } : null;

    if (requestId && parts.length > 0) {
      await db.from('glass_match_candidates').insert(
        parts.slice(0, 5).map((p, i) => ({
          request_id:   requestId,
          source:       'autoglass_match',
          nags:         p.nagsPartNumber ?? p.nags ?? null,
          oem_part_number: p.oemPartNumber ?? null,
          confidence:   Number(p.confidence ?? 0),
          rank:         i + 1,
          raw_payload:  p,
          accepted:     i === 0 && !!best,
        }))
      );
    }

    return { match, cost: success ? COST_PER_LOOKUP : 0 };

  } finally {
    await db.from('provider_calls').insert({
      request_id:       requestId,
      provider:         'autoglass_match',
      operation:        'resolve_glass',
      success,
      http_status:      httpStatus,
      latency_ms:       Date.now() - t0,
      cost_amount:      success ? COST_PER_LOOKUP : 0,
      cost_currency:    'USD',
      response_payload: responseJson,
    });
  }
}

// ---------------------------------------------------------------------------
// DB-hjelpere
// ---------------------------------------------------------------------------
async function createResolutionRequest(params) {
  const { data, error } = await db
    .from('glass_resolution_requests')
    .insert({
      vin:              params.vin,
      opening:          params.opening,
      market:           params.market,
      mode:             params.mode,
      features:         params.features,
      feature_signature: params.featureSig,
      status:           'pending',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Kunne ikke opprette request: ${error.message}`);
  return data.id;
}

async function resolveRequest(requestId, match, path, paidUsed, cost, matchId) {
  await db.from('glass_resolution_requests').update({
    status:           'resolved',
    resolution_path:  path,
    paid_lookup_used: paidUsed,
    chosen_match_id:  matchId,
    provider_cost:    cost,
    resolved_at:      new Date().toISOString(),
  }).eq('id', requestId);
}

async function updateRequestStatus(requestId, status, path) {
  await db.from('glass_resolution_requests').update({
    status,
    resolution_path: path,
    resolved_at:     new Date().toISOString(),
  }).eq('id', requestId);
}

async function queueManualReview(requestId, reason, severity) {
  await db.from('manual_review_queue').insert({ request_id: requestId, reason, severity });
}

async function upsertRule({ normalizedKey, market, opening, featureSig, match }) {
  await db.from('glass_rules').upsert({
    normalized_key:    normalizedKey,
    market,
    opening,
    feature_signature: featureSig,
    ktype:             match.ktype             ?? null,
    kba:               match.kba               ?? null,
    nags:              match.nags              ?? null,
    oem_part_number:   match.oemPartNumber      ?? null,
    eurocode:          match.eurocode           ?? null,
    confidence:        match.confidence,
    evidence_count:    1,
    active:            true,
    updated_at:        new Date().toISOString(),
  }, { onConflict: 'normalized_key,market,opening,feature_signature', ignoreDuplicates: false });
}

async function incrementRuleEvidence(ruleId) {
  await db.rpc('increment_rule_evidence', { rule_id: ruleId }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------
function normalizeVehicleKey(v) {
  const parts = [
    (v.make        ?? '').toLowerCase().trim().replace(/\s+/g, '_'),
    (v.model       ?? '').toLowerCase().trim().replace(/\s+/g, '_'),
    String(v.year  ?? 'unknown'),
    (v.body_style  ?? 'unknown').toLowerCase().trim().replace(/\s+/g, '_'),
    String(v.doors ?? ''),
  ].filter(Boolean);
  return parts.join(':');
}

function buildFeatureSignature(opening, features = {}) {
  const bool = (v) => (v ? '1' : '0');
  return [
    opening,
    `camera:${bool(features.camera)}`,
    `hud:${bool(features.hud)}`,
    `rain:${bool(features.rainSensor)}`,
    `heated:${bool(features.heated)}`,
    `acoustic:${bool(features.acoustic)}`,
  ].join('|');
}

function toGlassMatch(row, source) {
  return {
    ktype:          row.ktype          ?? null,
    kba:            row.kba            ?? null,
    nags:           row.nags           ?? null,
    oemPartNumber:  row.oem_part_number ?? null,
    eurocode:       row.eurocode        ?? null,
    confidence:     Number(row.confidence),
    source,
  };
}

function buildResponse(requestId, status, path, paidLookupUsed, match = null, cost = 0) {
  return {
    requestId,
    status,
    resolutionPath:  path,
    paidLookupUsed,
    match:           match ?? undefined,
    providerCost:    cost > 0 ? cost : undefined,
  };
}

function validateVin(vin) {
  if (!vin || typeof vin !== 'string') throw new Error('VIN må være en streng');
  const clean = vin.trim().toUpperCase();
  if (clean.length !== 17) throw new Error(`Ugyldig VIN-lengde: ${clean.length} (forventer 17)`);
  if (/[IOQ]/.test(clean))  throw new Error('VIN inneholder ugyldig tegn (I, O eller Q)');
}

// ---------------------------------------------------------------------------
// CLI-kjøring (node scripts/lib/vin-glass-resolver.mjs WVW... windshield)
// ---------------------------------------------------------------------------
if (process.argv[1]?.endsWith('vin-glass-resolver.mjs')) {
  const [, , vin, opening = 'windshield', market = 'EU'] = process.argv;
  if (!vin) {
    console.error('Bruk: node scripts/lib/vin-glass-resolver.mjs <VIN> [opening] [market]');
    process.exit(1);
  }
  resolveGlass({ vin, opening, market })
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => { console.error(e); process.exit(1); });
}

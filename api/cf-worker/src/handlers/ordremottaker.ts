/**
 * AI Ordremottaker handler
 * POST /api/ordremottaker
 */

import type { Env, GlassRecord, OrdremottakerRequest, OrdremottakerResponse, AccessoryItem, GroundTruthRecord } from '../types';
import { jsonResponse, errorResponse } from '../lib/cors';
import { extractVehicleHybrid } from '../lib/ordremottaker-ner';
import { generateDialogue, buildCartUrl } from '../lib/ordremottaker-llm';
import { createSession, getSession, updateSession, addMessage } from '../lib/ordremottaker-session';
import { searchByRegnr } from './search';
import { queryByBrandAndYear, queryByBrandOnly, queryByEurocode } from '../lib/db';
import { normalizeRecord } from '../lib/normalize';
import { decodeVin } from '../lib/vin-decoder';
import { getCustomerHistory } from '../lib/customer-history';
import { sha256 } from '../lib/learning';

type Candidate = Record<string, unknown> & { properties?: Record<string, unknown> };

interface EquipmentFlags {
  hasAdas: boolean;
  hasLdw: boolean;
  isHeated: boolean;
  heatedType: 'full' | 'camera' | null;
  hasHud: boolean;
  hasAntenna: boolean;
  hasCoated: boolean;
  hasRainSensor: boolean;
  hasAcoustic: boolean;
}

/** Bygg tilbehørsliste basert på posisjon og equipment */
function buildAccessories(position: string | null, flags: EquipmentFlags): AccessoryItem[] {
  const accessories: AccessoryItem[] = [];

  if (position === 'bakrute') {
    accessories.push({ sku: 'LIM-STD', name: 'Lim', price: 189, included: true, removable: false, category: 'required' });
    accessories.push({ sku: 'KLIPS-STD', name: 'Klips', price: 89, included: true, removable: true, category: 'required' });
  } else if (position === 'dørrute' || position === 'siderute') {
    accessories.push({ sku: 'KLIPS-STD', name: 'Klips', price: 89, included: true, removable: true, category: 'required' });
    accessories.push({ sku: 'TETNING-STD', name: 'Tetningslist', price: 145, included: true, removable: false, category: 'required' });
  } else {
    // Default = frontrute
    accessories.push({ sku: 'LIST-STD', name: 'Pyntelist', price: 245, included: true, removable: false, category: 'required' });
    accessories.push({ sku: 'LIM-STD', name: 'Lim', price: 189, included: true, removable: false, category: 'required' });
    accessories.push({ sku: 'KLIPS-STD', name: 'Klips', price: 89, included: true, removable: true, category: 'required' });
  }

  if (flags.hasAdas || flags.hasLdw) {
    accessories.push({
      sku: 'ADAS-WARN',
      name: 'ADAS-kalibrering',
      price: 0,
      included: false,
      removable: false,
      category: 'warning',
      notes: 'Kalibrering av førerassistentsystemer kreves etter montering av frontrute med kamera/sensor',
    });
  }

  if (flags.isHeated) {
    if (flags.heatedType === 'camera') {
      accessories.push({
        sku: 'LIM-HEAT-CAM',
        name: 'Spesial-lim (kamera-varme)',
        price: 299,
        included: true,
        removable: true,
        category: 'recommended',
        notes: 'Anbefalt for frontrute med varmesone foran kamera — sikrer best isolasjon',
      });
    } else {
      accessories.push({
        sku: 'LIM-HEAT',
        name: 'Spesial-lim (varmebestandig)',
        price: 249,
        included: true,
        removable: true,
        category: 'recommended',
        notes: 'Anbefalt for oppvarmet glass — tåler høyere temperaturer',
      });
    }
  }

  if (flags.hasHud) {
    accessories.push({
      sku: 'HUD-WARN',
      name: 'HUD-spesialglass',
      price: 0,
      included: false,
      removable: false,
      category: 'warning',
      notes: 'Head-Up Display krever spesialfrontrute — sjekk at valgt glass støtter HUD-projeksjon',
    });
  }

  if (flags.hasAntenna) {
    accessories.push({
      sku: 'ANT-WARN',
      name: 'Integrert antenne',
      price: 0,
      included: false,
      removable: false,
      category: 'warning',
      notes: 'Frontruten har integrert antenne — sørg for riktig tilkobling ved montering',
    });
  }

  return accessories;
}

/** Hjelper for å lese equipment fra properties (normalisert av normalizeRecord) */
function getProp(c: { properties?: Record<string, unknown> }, key: string): unknown {
  const props = c.properties || {};
  return props[key];
}

type EquipmentField = 'adas' | 'ldw' | 'rainSensor' | 'heated' | 'heated_type' | 'hud' | 'antenna' | 'coated' | 'acoustic';

/** Sjekk om kandidater har variasjon i et gitt equipment-felt */
function hasVariation(candidates: Candidate[], field: EquipmentField): boolean {
  if (field === 'ldw') {
    const hasLdw = candidates.some((c) => !!getProp(c, 'lane_assist') || !!getProp(c, 'adas'));
    const hasNoLdw = candidates.some((c) => !getProp(c, 'lane_assist') && !getProp(c, 'adas'));
    return hasLdw && hasNoLdw;
  }
  if (field === 'heated_type') {
    const heatedCandidates = candidates.filter((c) => !!getProp(c, 'heated'));
    if (heatedCandidates.length < 2) return false;
    const hasFull = heatedCandidates.some((c) => !getProp(c, 'camera'));
    const hasCamera = heatedCandidates.some((c) => !!getProp(c, 'camera'));
    return hasFull && hasCamera;
  }
  const values = new Set<string>();
  for (const c of candidates) {
    const val = String(!!getProp(c, field));
    values.add(val);
    if (values.size > 1) return true;
  }
  return values.size > 1;
}

/** Filtrer kandidater basert på equipment-svar */
function filterByEquipment(candidates: Candidate[], answers: Record<string, string>): Candidate[] {
  return candidates.filter((c) => {
    for (const [field, answer] of Object.entries(answers)) {
      if (answer === 'vet_ikke') continue;
      if (field === 'ldw') {
        const hasLdw = !!getProp(c, 'lane_assist') || !!getProp(c, 'adas');
        const expected = answer === 'ja';
        if (hasLdw !== expected) return false;
        continue;
      }
      if (field === 'heated_type') {
        if (answer === 'full') {
          if (!getProp(c, 'heated') || !!getProp(c, 'camera')) return false;
        } else if (answer === 'camera') {
          if (!getProp(c, 'heated') || !getProp(c, 'camera')) return false;
        }
        continue;
      }
      if (field === 'adas' || field === 'rainSensor' || field === 'heated' || field === 'hud' || field === 'antenna' || field === 'coated' || field === 'acoustic') {
        const expected = answer === 'ja' ? 'true' : answer === 'nei' ? 'false' : answer;
        if (String(!!getProp(c, field)) !== expected) return false;
      }
    }
    return true;
  });
}

/** Parse posisjon-svar fra bruker */
function parsePositionAnswer(message: string): string | null {
  const lower = message.toLowerCase().trim();
  if (lower.includes('frontrute') || lower.includes('vindskjerm') || lower.includes('front')) return 'frontrute';
  if (lower.includes('bakrute') || lower.includes('bakvindu') || lower.includes('bak')) return 'bakrute';
  if (lower.includes('dørrute') || lower.includes('sidedør') || lower.includes('dør')) return 'dørrute';
  if (lower.includes('siderute') || lower.includes('sidevindu') || lower.includes('side')) return 'siderute';
  return null;
}

/** Parse equipment-svar fra bruker: ja / nei / vet_ikke */
function parseEquipmentAnswer(message: string): 'ja' | 'nei' | 'vet_ikke' | null {
  const lower = message.toLowerCase().trim();
  if (lower === 'ja' || lower === 'yes' || lower === 'true' || lower === 'jepp' || lower === 'joda' || lower === 'jo' || lower === 'y' || lower === '1') return 'ja';
  if (lower === 'nei' || lower === 'no' || lower === 'false' || lower === 'nope' || lower === 'niks' || lower === 'n' || lower === '0') return 'nei';
  if (lower === 'vet ikke' || lower === 'vetikke' || lower === 'usikker' || lower === 'ikke sikker' || lower === 'maybe' || lower === 'kanskje' || lower === '?') return 'vet_ikke';
  return null;
}

/** Parse heated_type-svar: full vs kamera-sone */
function parseHeatedTypeAnswer(message: string): 'full' | 'camera' | null {
  const lower = message.toLowerCase().trim();
  if (lower.includes('full') || lower.includes('hele') || lower.includes('alt') || lower.includes('alt sammen')) return 'full';
  if (lower.includes('kamera') || lower.includes('cam') || lower.includes('bare') || lower.includes('sone') || lower.includes('zone')) return 'camera';
  return null;
}

/** Map posisjon til ground_truth kolonne(r) for oppslag */
function getGroundTruthColumns(position: string): string[] {
  const p = position.toLowerCase().trim();
  if (p === 'frontrute') return ['frontrute_eurocode'];
  if (p === 'bakrute') return ['bakrute_eurocode'];
  if (p === 'dørrute-frem' || p === 'dør-frem') return ['dor_fv_eurocode', 'dor_fh_eurocode'];
  if (p === 'dørrute-bak' || p === 'dør-bak') return ['dor_bv_eurocode', 'dor_bh_eurocode'];
  if (p === 'siderute') return ['sideglass_fv_eurocode', 'sideglass_fh_eurocode', 'sideglass_bv_eurocode', 'sideglass_bh_eurocode'];
  if (p === 'dørrute' || p === 'dør') return ['dor_fv_eurocode', 'dor_fh_eurocode', 'dor_bv_eurocode', 'dor_bh_eurocode'];
  return [];
}

/** Map posisjon til ground_truth kolonne for upsert (feedback) */
function getGroundTruthColumnForUpsert(position: string): string | null {
  const p = position.toLowerCase().trim();
  if (p === 'frontrute') return 'frontrute_eurocode';
  if (p === 'bakrute') return 'bakrute_eurocode';
  if (p === 'dørrute-frem' || p === 'dør-frem') return 'dor_fv_eurocode';
  if (p === 'dørrute-bak' || p === 'dør-bak') return 'dor_bv_eurocode';
  if (p === 'siderute') return 'sideglass_fv_eurocode';
  if (p === 'dørrute' || p === 'dør') return 'dor_fv_eurocode';
  return null;
}

/** Bygg spørsmål for neste equipment-variasjon */
function buildEquipmentQuestion(
  candidates: Candidate[],
  answers: Record<string, string>,
  position: string
): { field: string; question: string; nextAction: string } | null {
  const isFront = position === 'frontrute' || position === 'glass';
  const isBack = position === 'bakrute';
  const glassType = isBack ? 'bakruten' : isFront ? 'frontruten' : 'glasset';

  const priority: Array<{ field: EquipmentField; question: string; nextAction: string; frontOnly?: boolean }> = [
    { field: 'adas', question: `Har bilen ADAS-kamera i ${glassType}? Dette er et kamera bak frontruten som brukes til trafikkskiltgjenkjenning og adaptiv cruisekontroll.`, nextAction: 'ask_adas', frontOnly: true },
    { field: 'ldw', question: `Har bilen filholderassistent (Lane Assist / LDW)? Dette hjelper deg å holde deg i filen.`, nextAction: 'ask_ldw', frontOnly: true },
    { field: 'heated', question: `Har bilen oppvarmet ${glassType}?`, nextAction: 'ask_heated' },
    { field: 'heated_type', question: `Er det full varme i hele frontruten, eller bare en varmesone foran kameraet?`, nextAction: 'ask_heated_type', frontOnly: true },
    { field: 'hud', question: `Har bilen Head-Up Display (HUD)? Dette projiserer hastighet og info i frontruten.`, nextAction: 'ask_hud', frontOnly: true },
    { field: 'antenna', question: `Har bilen antenne integrert i ${glassType}?`, nextAction: 'ask_antenna', frontOnly: true },
    { field: 'coated', question: `Ønsker du varmereflekterende (solar/coated) ${glassType}? Dette holder varmen ute om sommeren.`, nextAction: 'ask_coated' },
    { field: 'rainSensor', question: 'Har bilen regnsensor som aktiverer vindusviskerne automatisk?', nextAction: 'ask_rain_sensor' },
    { field: 'acoustic', question: `Ønsker du akustisk (støydempet) ${glassType}? Dette gir deg en stillere kabin.`, nextAction: 'ask_acoustic' },
  ];

  for (const item of priority) {
    if (answers[item.field] !== undefined) continue;
    if (item.frontOnly && !isFront) continue;

    // heated_type is a follow-up only after user confirms heated=ja
    if (item.field === 'heated_type') {
      if (answers['heated'] !== 'ja') continue;
      if (!hasVariation(candidates, 'heated_type')) continue;
      return item;
    }

    if (hasVariation(candidates, item.field)) {
      return item;
    }
  }
  return null;
}

/** Ekstraher posisjon fra melding (fallback når NER ikke er kjørt) */
function extractPositionFromMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('frontrute') || lower.includes('vindskjerm')) return 'frontrute';
  if (lower.includes('bakrute') || lower.includes('bakvindu')) return 'bakrute';
  if (lower.includes('dørrute') || lower.includes('sidedør')) return 'dørrute';
  if (lower.includes('siderute') || lower.includes('sidevindu')) return 'siderute';
  return 'glass';
}

export async function handleOrdremottaker(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse('Kun POST støttet', 405);
  }

  let body: OrdremottakerRequest;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Ugyldig JSON', 400);
  }

  if (!body.message || typeof body.message !== 'string') {
    return errorResponse('Mangler message', 400);
  }

  try {
    // 1. Get or create session
    let sessionToken = body.session_token || '';
    let session = sessionToken ? await getSession(env, sessionToken) : null;
    if (!session) {
      sessionToken = await createSession(env);
      session = await getSession(env, sessionToken);
    }
    if (!session) {
      return errorResponse('Kunne ikke opprette session', 500);
    }

    // 2. Add user message
    await addMessage(env, sessionToken, 'user', body.message);

    // 3. State variables
    let candidates: Candidate[] = [];
    let vehicleInfo: { make: string; model: string; year: number } | undefined;
    let aiResponse = '';
    let status: OrdremottakerResponse['status'] = 'clarification';
    let nextAction: string | null = null;
    let confidence = 0;
    let nerResult: any = null;

    // Equipment answers (start fresh for new searches; preserved when answering pending questions)
    let equipmentAnswers: Record<string, string> = {};

    // ── A: Handle pending question (equipment OR position) ──
    if (session.pending_question) {
      let answer: string | null = null;
      if (session.pending_question === 'heated_type') {
        answer = parseHeatedTypeAnswer(body.message);
      } else if (session.pending_question === 'position') {
        answer = parsePositionAnswer(body.message);
      } else {
        answer = parseEquipmentAnswer(body.message);
      }
      if (answer !== null) {
        equipmentAnswers = { ...(session.answers || {}) };
        equipmentAnswers[session.pending_question] = answer;

        // Load stored candidates from previous turn
        if (session.candidate_data) {
          try {
            candidates = JSON.parse(session.candidate_data);
          } catch {
            candidates = [];
          }
        }

        // If position was just answered, filter candidates by position first
        if (session.pending_question === 'position' && candidates.length > 0) {
          const pos = answer.toLowerCase();
          candidates = candidates.filter((c: Candidate) => {
            const cat = String(c.category || '').toLowerCase();
            if (pos === 'frontrute') return cat.includes('front');
            if (pos === 'bakrute') return cat.includes('bak');
            if (pos === 'dørrute' || pos === 'dør') return cat.includes('dør') || cat.includes('dor');
            if (pos === 'siderute') return cat.includes('side');
            return true;
          });
        }

        // Filter by all accumulated equipment answers
        if (candidates.length > 0) {
          candidates = filterByEquipment(candidates, equipmentAnswers);
        }

        vehicleInfo = session.vehicle;
        confidence = 0.8; // We already had a good search before
      }
      // If not a valid answer, fall through to normal NER/search (user may have changed topic)
    }

    // ── B: Normal search flow ──
    if (candidates.length === 0) {
      // NER extraction (hybrid: regex + LLM fallback)
      nerResult = await extractVehicleHybrid(env, body.message);
      confidence = nerResult.confidence;

      if (nerResult.confidence >= 0.2) {
        if (nerResult.regnr) {
          console.log(`[Ordremottaker] Searching by regnr: ${nerResult.regnr}`);

          // Ground truth lookup BEFORE search
          const regnrHash = await sha256(nerResult.regnr);
          const gt = await env.GLASS_CATALOG_D1
            .prepare("SELECT * FROM ground_truth WHERE regnr_hash = ?")
            .bind(regnrHash)
            .first() as unknown as GroundTruthRecord | null;

          const gtEurocodes = new Set<string>();
          if (gt) {
            const pos = nerResult.position?.toLowerCase() || 'frontrute';
            const columns = getGroundTruthColumns(pos);
            for (const col of columns) {
              const eurocode = gt[col as keyof GroundTruthRecord] as string | null;
              if (eurocode && !gtEurocodes.has(eurocode)) {
                gtEurocodes.add(eurocode);
                const record = await queryByEurocode(env.GLASS_CATALOG_D1, eurocode);
                if (record) {
                  console.log(`[Ordremottaker] Ground truth hit for ${nerResult.regnr}: ${eurocode}`);
                  candidates.push({ ...normalizeRecord(record), isGroundTruth: true });
                }
              }
            }
          }

          const searchResult = await searchByRegnr(nerResult.regnr, env);
          if (searchResult.httpStatus === 200) {
            const searchBody = searchResult.body as {
              candidates?: Candidate[];
              vehicle?: { make: string; model: string; year: number };
            };
            const searchCandidates = searchBody.candidates || [];
            // Merge search candidates, avoiding duplicates with ground truth
            for (const sc of searchCandidates) {
              if (!gtEurocodes.has(sc.eurocode as string)) {
                candidates.push(sc);
              }
            }
            vehicleInfo = searchBody.vehicle;
          }
        } else if (nerResult.vin) {
          const vinData = decodeVin(nerResult.vin);
          if (vinData) {
            const make = vinData.make.charAt(0).toUpperCase() + vinData.make.slice(1);
            const year = vinData.modelYear || new Date().getFullYear();
            vehicleInfo = { make, model: vinData.generation, year };
            const db = env.GLASS_CATALOG_D1;
            let dbCandidates = await queryByBrandAndYear(db, vinData.make, year);
            if (dbCandidates.length === 0) {
              dbCandidates = await queryByBrandOnly(db, vinData.make, vinData.generation);
            }
            candidates = dbCandidates.map(normalizeRecord) as unknown as Candidate[];
          }
        } else if (nerResult.make && nerResult.year) {
          const db = env.GLASS_CATALOG_D1;
          vehicleInfo = {
            make: nerResult.make,
            model: nerResult.model || '',
            year: nerResult.year,
          };
          const { results } = await db
            .prepare("SELECT * FROM glass_catalog WHERE brand = ? AND year_from <= ? AND year_to >= ? LIMIT 100")
            .bind(nerResult.make, nerResult.year, nerResult.year)
            .all();
          let dbCandidates = (results || []) as unknown as GlassRecord[];
          if (dbCandidates.length === 0) {
            const { results: r2 } = await db
              .prepare("SELECT * FROM glass_catalog WHERE UPPER(brand) = UPPER(?) AND year_from <= ? AND year_to >= ? LIMIT 100")
              .bind(nerResult.make, nerResult.year, nerResult.year)
              .all();
            dbCandidates = (r2 || []) as unknown as GlassRecord[];
          }
          candidates = dbCandidates.map(normalizeRecord) as unknown as Candidate[];
        } else if (nerResult.make) {
          const db = env.GLASS_CATALOG_D1;
          vehicleInfo = {
            make: nerResult.make,
            model: nerResult.model || '',
            year: nerResult.year || new Date().getFullYear(),
          };
          const dbCandidates = await queryByBrandOnly(db, nerResult.make, nerResult.model || undefined);
          candidates = dbCandidates.map(normalizeRecord) as unknown as Candidate[];
        }
      }

      // Filter by position if specified
      if (nerResult?.position && candidates.length > 0) {
        const pos = nerResult.position.toLowerCase();
        candidates = candidates.filter((c: Candidate) => {
          const cat = String(c.category || '').toLowerCase();
          if (pos === 'frontrute') return cat.includes('front');
          if (pos === 'bakrute') return cat.includes('bak');
          if (pos === 'dørrute-frem' || pos === 'dørrute-bak') return cat.includes('dør');
          if (pos === 'siderute') return cat.includes('side');
          return true;
        });
      }

      // Auto-apply equipment from NER (user mentioned it explicitly)
      if (nerResult?.adas !== null) equipmentAnswers['adas'] = nerResult.adas ? 'ja' : 'nei';
      if (nerResult?.rain_sensor !== null) equipmentAnswers['rainSensor'] = nerResult.rain_sensor ? 'ja' : 'nei';
      if (nerResult?.heated !== null) equipmentAnswers['heated'] = nerResult.heated ? 'ja' : 'nei';
    }

    // Apply all accumulated equipment answers to filter candidates
    if (Object.keys(equipmentAnswers).length > 0 && candidates.length > 0) {
      candidates = filterByEquipment(candidates, equipmentAnswers);
    }

    // ── C: Build response ──
    if (confidence < 0.3 && candidates.length === 0) {
      // Very low confidence - ask for more info
      aiResponse = 'Hei! For å finne riktig glass trenger jeg å vite: bilmerke, modell, årsmodell, og hvilket glass (frontrute, bakrute, sidedør, etc.). Har du registreringsnummer er det enda bedre!';
      status = 'clarification';
      nextAction = 'ask_vehicle_details';
    } else if (candidates.length === 0 && vehicleInfo) {
      // We understood vehicle but no glass found
      aiResponse = `Jeg forstår at du trenger glass til ${vehicleInfo.make} ${vehicleInfo.model} (${vehicleInfo.year}). Dessverre fant jeg ingen glass som passer i katalogen vår. Kan du dobbeltsjekke årsmodellen, eller har du registreringsnummer?`;
      status = 'clarification';
      nextAction = 'ask_regnr_or_verify_year';
    } else if (candidates.length > 0) {
      // We have candidates
      const pos = nerResult?.position || extractPositionFromMessage(body.message);

      // If position is unknown and candidates have mixed categories, ask position FIRST
      const posKnown = pos !== 'glass';
      if (!posKnown && !session.answers?.position) {
        const categories = new Set(candidates.map((c: Candidate) => String(c.category || '').toLowerCase()));
        if (categories.size > 1) {
          aiResponse = `Flott — jeg fant ${candidates.length} glass som passer. Hvilket glass trenger du? (frontrute, bakrute, siderute, eller dørrute)`;
          status = 'question';
          nextAction = 'ask_position';
        }
      }

      // If position is known (or only one category), check equipment variations
      if (status !== 'question') {
        const eqQuestion = candidates.length > 3 ? buildEquipmentQuestion(candidates, equipmentAnswers, pos) : null;

        if (eqQuestion) {
          aiResponse = eqQuestion.question;
          status = 'question';
          nextAction = eqQuestion.nextAction;
      } else {
        // Show results
        const make = vehicleInfo?.make || nerResult?.make || '';
        const model = vehicleInfo?.model || nerResult?.model || '';
        const year = vehicleInfo?.year || nerResult?.year || '';
        const count = candidates.length;

        // Build vehicle description without duplicates
        const modelWithoutMake = model && model.toUpperCase().startsWith(make.toUpperCase())
          ? model.slice(make.length).trim()
          : model;
        const vehicleDesc = [
          make,
          modelWithoutMake && modelWithoutMake !== make ? modelWithoutMake : '',
          year && String(year) !== modelWithoutMake ? `(${year})` : ''
        ].filter(Boolean).join(' ');

        if (nerResult?.regnr) {
          aiResponse = `Forstått — ${vehicleDesc}, ${pos}. Her er glassene som passer basert på regnr ${nerResult.regnr}:`;
        } else if (nerResult?.vin) {
          aiResponse = `Forstått — ${vehicleDesc}, ${pos}. Her er glassene som passer:`;
        } else if (make && year && year < 2030) {
          aiResponse = `Forstått — ${vehicleDesc}, ${pos}. Jeg har ${count} alternativer. Velg OEM eller aftermarket:`;
        } else if (make) {
          aiResponse = `Forstått — ${make}, ${pos}. Jeg har ${count} alternativer. Sjekk at det stemmer:`;
        } else {
          aiResponse = `Her er ${count} glass som kan passe. Sjekk at merke og modell stemmer:`;
        }
        status = 'recommendation';
        nextAction = 'show_candidates';
      }
    }
    } else {
      // Partial understanding
      const parts: string[] = [];
      if (nerResult?.make) parts.push(nerResult.make);
      if (nerResult?.model) parts.push(nerResult.model);
      if (nerResult?.year) parts.push(String(nerResult.year));
      if (nerResult?.position) parts.push(nerResult.position);

      if (parts.length > 0) {
        aiResponse = `Jeg forstår at du trenger ${parts.join(' ')}. For å finne eksakt riktig glass, kan du oppgi registreringsnummer eller bekrefte årsmodellen?`;
      } else {
        aiResponse = 'Hei! Jeg hjelper deg å finne riktig bilglass. Kan du oppgi bilmerke, modell, årsmodell og hvilket glass du trenger (frontrute, bakrute, etc.)?';
      }
      status = 'clarification';
      nextAction = 'ask_vehicle_details';
    }

    // Build position-based accessories
    const pos = nerResult?.position || extractPositionFromMessage(body.message);
    const hasAdas = candidates.some((c: Candidate) => !!getProp(c, 'adas')) || equipmentAnswers['adas'] === 'ja';
    const hasLdw = candidates.some((c: Candidate) => !!getProp(c, 'lane_assist') || !!getProp(c, 'adas')) || equipmentAnswers['ldw'] === 'ja';
    const isHeated = candidates.some((c: Candidate) => !!getProp(c, 'heated')) || equipmentAnswers['heated'] === 'ja';
    const heatedType = (equipmentAnswers['heated_type'] as 'full' | 'camera' | undefined) || null;
    const hasHud = candidates.some((c: Candidate) => !!getProp(c, 'hud')) || equipmentAnswers['hud'] === 'ja';
    const hasAntenna = candidates.some((c: Candidate) => !!getProp(c, 'antenna')) || equipmentAnswers['antenna'] === 'ja';
    const hasCoated = candidates.some((c: Candidate) => !!getProp(c, 'coated')) || equipmentAnswers['coated'] === 'ja';
    const hasRainSensor = candidates.some((c: Candidate) => !!getProp(c, 'rainSensor')) || equipmentAnswers['rainSensor'] === 'ja';
    const hasAcoustic = candidates.some((c: Candidate) => !!getProp(c, 'acoustic')) || equipmentAnswers['acoustic'] === 'ja';
    const accessories = buildAccessories(pos, {
      hasAdas, hasLdw, isHeated, heatedType,
      hasHud, hasAntenna, hasCoated, hasRainSensor, hasAcoustic
    });

    // Build cart URL if recommendation and candidates exist
    let cartUrl: string | undefined;
    if (status === 'recommendation' && candidates.length > 0) {
      const topCandidate = candidates[0] as Candidate;
      const sku =
        (topCandidate.supplier_sku as string | undefined) ||
        (topCandidate.articleNumber as string | undefined) ||
        (topCandidate.eurocode as string | undefined) ||
        String(topCandidate.id);
      const includedAccessories = accessories.filter((a) => a.included && !a.removable);
      const cartItems = [
        { sku, qty: 1 },
        ...includedAccessories.map((a) => ({ sku: a.sku, qty: 1 })),
      ];
      cartUrl = buildCartUrl(cartItems);
    }

    // Update session
    const pendingQuestionField = nextAction?.startsWith('ask_')
      ? (() => {
          const field = nextAction.replace('ask_', '');
          const mapping: Record<string, string> = {
            rain_sensor: 'rainSensor',
            heated_type: 'heated_type',
            ldw: 'ldw',
            hud: 'hud',
            antenna: 'antenna',
            coated: 'coated',
          };
          return mapping[field] || field;
        })()
      : null;

    await updateSession(env, sessionToken, {
      vehicle: vehicleInfo,
      candidates: candidates.map((c: Candidate) => c.id).filter((id): id is number => typeof id === 'number'),
      status: status === 'recommendation' ? 'completed' : 'active',
      pending_question: pendingQuestionField,
      candidate_data: status === 'question' ? JSON.stringify(candidates) : undefined,
      answers: equipmentAnswers,
    });

    // Fetch proactive suggestions for known B2B customers
    let proactiveSuggestions: OrdremottakerResponse['proactive_suggestions'];
    if (body.customer_id && typeof body.customer_id === 'number') {
      try {
        const db = env.GLASS_CATALOG_D1;
        proactiveSuggestions = (await getCustomerHistory(db, body.customer_id)) || undefined;
      } catch (err) {
        console.error(
          `[Ordremottaker] Failed to load customer history for ${body.customer_id}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    // Add AI message
    await addMessage(env, sessionToken, 'ai', aiResponse);

    // Return response
    const response: OrdremottakerResponse = {
      status,
      ai_response: aiResponse,
      session_token: sessionToken,
      candidates: status === 'recommendation' ? candidates.slice(0, 5) as unknown as GlassRecord[] : undefined,
      accessories: status === 'recommendation' ? accessories : undefined,
      cart_url: cartUrl,
      confidence: confidence,
      next_action: nextAction || undefined,
      proactive_suggestions: proactiveSuggestions,
    };

    return jsonResponse(response);
  } catch (e) {
    console.error(
      `[Ordremottaker] Handler error: ${e instanceof Error ? e.message : String(e)}`
    );
    return errorResponse('Intern feil i ordremottaker', 500);
  }
}

export async function handleFeedback(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse('Kun POST støttet', 405);
  }

  let body: {
    session_token: string;
    regnr?: string;
    position: string;
    recommended_eurocode?: string;
    chosen_eurocode: string;
    was_correct: number;
    correction_eurocode?: string;
    correction_reason?: string;
    equipment_answers?: Record<string, string>;
    make?: string;
    model?: string;
    year?: number;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Ugyldig JSON', 400);
  }

  if (!body.session_token || typeof body.session_token !== 'string') {
    return errorResponse('Mangler session_token', 400);
  }
  if (!body.position || typeof body.position !== 'string') {
    return errorResponse('Mangler position', 400);
  }
  if (!body.chosen_eurocode || typeof body.chosen_eurocode !== 'string') {
    return errorResponse('Mangler chosen_eurocode', 400);
  }
  if (typeof body.was_correct !== 'number') {
    return errorResponse('Mangler was_correct', 400);
  }

  try {
    const regnrHash = body.regnr ? await sha256(body.regnr) : null;
    const db = env.GLASS_CATALOG_D1;

    // Insert into feedback_log
    const insertResult = await db.prepare(
      `INSERT INTO feedback_log (
        session_token, regnr_hash, position,
        recommended_eurocode, chosen_eurocode, was_correct,
        correction_eurocode, correction_reason, equipment_answers
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      body.session_token,
      regnrHash,
      body.position,
      body.recommended_eurocode || null,
      body.chosen_eurocode,
      body.was_correct,
      body.correction_eurocode || null,
      body.correction_reason || null,
      body.equipment_answers ? JSON.stringify(body.equipment_answers) : null
    ).run();

    const feedbackId = insertResult.meta?.last_row_id ?? 0;

    // If correct, upsert into ground_truth
    if (body.was_correct === 1 && regnrHash) {
      const col = getGroundTruthColumnForUpsert(body.position);
      if (col) {
        // Get make/model/year from session if available
        const session = await getSession(env, body.session_token);
        const make = session?.vehicle?.make || body.make || '';
        const model = session?.vehicle?.model || body.model || '';
        const year = session?.vehicle?.year || body.year || new Date().getFullYear();

        if (make && year) {
          await db.prepare(
            `INSERT INTO ground_truth (
              regnr_hash, make, model, year, ${col},
              verified_by, confidence
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(regnr_hash) DO UPDATE SET
              make = excluded.make,
              model = excluded.model,
              year = excluded.year,
              ${col} = excluded.${col},
              verified_by = excluded.verified_by,
              confidence = excluded.confidence,
              verified_at = CURRENT_TIMESTAMP`
          ).bind(
            regnrHash,
            make,
            model,
            year,
            body.chosen_eurocode,
            'ai_feedback',
            0.9
          ).run();
        } else {
          console.warn(`[Ordremottaker-Feedback] Skipping ground_truth upsert: missing make/year for ${regnrHash}`);
        }
      }
    }

    return jsonResponse({ success: true, feedback_id: feedbackId });
  } catch (e) {
    console.error(`[Ordremottaker-Feedback] Error: ${e instanceof Error ? e.message : String(e)}`);
    return errorResponse('Kunne ikke lagre feedback', 500);
  }
}

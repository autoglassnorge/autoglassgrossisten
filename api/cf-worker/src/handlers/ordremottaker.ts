/**
 * AI Ordremottaker handler
 * POST /api/ordremottaker
 */

import type { Env, GlassRecord, OrdremottakerRequest, OrdremottakerResponse } from '../types';
import { jsonResponse, errorResponse } from '../lib/cors';
import { extractVehicleHybrid } from '../lib/ordremottaker-ner';
import { generateDialogue, buildCartUrl } from '../lib/ordremottaker-llm';
import { createSession, getSession, updateSession, addMessage } from '../lib/ordremottaker-session';
import { searchByRegnr } from './search';
import { queryByBrandAndYear, queryByBrandOnly } from '../lib/db';
import { normalizeRecord } from '../lib/normalize';
import { decodeVin } from '../lib/vin-decoder';
import { getCustomerHistory } from '../lib/customer-history';

const DEFAULT_ACCESSORIES = [
  { sku: 'LIST-STD', name: 'List', price: 245, included: true, removable: false },
  { sku: 'LIM-STD', name: 'Lim', price: 189, included: true, removable: false },
  { sku: 'KLIPS-STD', name: 'Klips', price: 89, included: true, removable: true },
];

/** Hjelper for å lese equipment fra properties (normalisert av normalizeRecord) */
function getProp(c: any, key: string): unknown {
  const props = (c.properties as Record<string, unknown>) || {};
  return props[key];
}

/** Sjekk om kandidater har variasjon i et gitt equipment-felt */
function hasVariation(candidates: any[], field: 'adas' | 'rainSensor' | 'heated' | 'acoustic'): boolean {
  const values = new Set<string>();
  for (const c of candidates) {
    const val = String(!!getProp(c, field));
    values.add(val);
    if (values.size > 1) return true;
  }
  return values.size > 1;
}

/** Filtrer kandidater basert på equipment-svar */
function filterByEquipment(candidates: any[], answers: Record<string, string>): any[] {
  return candidates.filter((c) => {
    for (const [field, answer] of Object.entries(answers)) {
      if (field === 'adas' || field === 'rainSensor' || field === 'heated' || field === 'acoustic') {
        if (String(!!getProp(c, field)) !== answer) return false;
      }
    }
    return true;
  });
}

/** Parse boolsk svar fra bruker */
function parseBooleanAnswer(message: string): boolean | null {
  const lower = message.toLowerCase().trim();
  if (lower === 'ja' || lower === 'yes' || lower === 'true' || lower === 'jepp' || lower === 'joda' || lower === 'jo' || lower === 'y') return true;
  if (lower === 'nei' || lower === 'no' || lower === 'false' || lower === 'nope' || lower === 'niks' || lower === 'n') return false;
  return null;
}

/** Bygg spørsmål for neste equipment-variasjon */
function buildEquipmentQuestion(candidates: any[], answers: Record<string, string>): { field: string; question: string; nextAction: string } | null {
  const priority = [
    { field: 'adas', question: 'Har bilen ADAS-kamera i frontruten?', nextAction: 'ask_adas' },
    { field: 'heated', question: 'Har bilen oppvarmet frontrute?', nextAction: 'ask_heated' },
    { field: 'rainSensor', question: 'Har bilen regnsensor?', nextAction: 'ask_rain_sensor' },
    { field: 'acoustic', question: 'Ønsker du akustisk (støydempet) glass?', nextAction: 'ask_acoustic' },
  ];

  for (const item of priority) {
    if (answers[item.field] !== undefined) continue;
    if (hasVariation(candidates, item.field as 'adas' | 'rainSensor' | 'heated' | 'acoustic')) {
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
    let candidates: any[] = [];
    let vehicleInfo: { make: string; model: string; year: number } | undefined;
    let aiResponse: string;
    let status: OrdremottakerResponse['status'];
    let nextAction: string | null = null;
    let confidence = 0;
    let nerResult: any = null;

    // Equipment answers (start fresh for new searches; preserved when answering pending questions)
    let equipmentAnswers: Record<string, string> = {};

    // ── A: Handle pending equipment question ──
    if (session.pending_question) {
      const answer = parseBooleanAnswer(body.message);
      if (answer !== null) {
        equipmentAnswers = { ...(session.answers || {}) };
        equipmentAnswers[session.pending_question] = String(answer);

        // Load stored candidates from previous turn
        if (session.candidate_data) {
          try {
            candidates = JSON.parse(session.candidate_data);
          } catch {
            candidates = [];
          }
        }

        // Filter by all accumulated answers
        if (candidates.length > 0) {
          candidates = filterByEquipment(candidates, equipmentAnswers);
        }

        vehicleInfo = session.vehicle;
        confidence = 0.8; // We already had a good search before
      }
      // If not a boolean answer, fall through to normal NER/search (user may have changed topic)
    }

    // ── B: Normal search flow ──
    if (candidates.length === 0) {
      // NER extraction (hybrid: regex + LLM fallback)
      nerResult = await extractVehicleHybrid(env, body.message);
      confidence = nerResult.confidence;

      if (nerResult.confidence >= 0.2) {
        if (nerResult.regnr) {
          console.log(`[Ordremottaker] Searching by regnr: ${nerResult.regnr}`);
          const searchResult = await searchByRegnr(nerResult.regnr, env);
          if (searchResult.httpStatus === 200) {
            const searchBody = searchResult.body as {
              candidates?: any[];
              vehicle?: { make: string; model: string; year: number };
            };
            candidates = searchBody.candidates || [];
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
            candidates = dbCandidates.map(normalizeRecord) as GlassRecord[];
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
          candidates = dbCandidates.map(normalizeRecord) as GlassRecord[];
        } else if (nerResult.make) {
          const db = env.GLASS_CATALOG_D1;
          vehicleInfo = {
            make: nerResult.make,
            model: nerResult.model || '',
            year: nerResult.year || new Date().getFullYear(),
          };
          const dbCandidates = await queryByBrandOnly(db, nerResult.make, nerResult.model || undefined);
          candidates = dbCandidates.map(normalizeRecord) as GlassRecord[];
        }
      }

      // Filter by position if specified
      if (nerResult?.position && candidates.length > 0) {
        const pos = nerResult.position.toLowerCase();
        candidates = candidates.filter((c: any) => {
          const cat = (c.category || '').toLowerCase();
          if (pos === 'frontrute') return cat.includes('front');
          if (pos === 'bakrute') return cat.includes('bak');
          if (pos === 'dørrute-frem' || pos === 'dørrute-bak') return cat.includes('dør');
          if (pos === 'siderute') return cat.includes('side');
          return true;
        });
      }

      // Auto-apply equipment from NER (user mentioned it explicitly)
      if (nerResult?.adas !== null) equipmentAnswers['adas'] = String(nerResult.adas);
      if (nerResult?.rain_sensor !== null) equipmentAnswers['rainSensor'] = String(nerResult.rain_sensor);
      if (nerResult?.heated !== null) equipmentAnswers['heated'] = String(nerResult.heated);
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
      // We have candidates — check for equipment variations first
      const eqQuestion = candidates.length > 3 ? buildEquipmentQuestion(candidates, equipmentAnswers) : null;

      if (eqQuestion) {
        aiResponse = eqQuestion.question;
        status = 'question';
        nextAction = eqQuestion.nextAction;
      } else {
        // Show results
        const pos = nerResult?.position || extractPositionFromMessage(body.message);
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

    // Build default accessories
    const accessories = DEFAULT_ACCESSORIES;

    // Build cart URL if recommendation and candidates exist
    let cartUrl: string | undefined;
    if (status === 'recommendation' && candidates.length > 0) {
      const topCandidate = candidates[0] as any;
      const sku =
        topCandidate.supplier_sku ||
        topCandidate.articleNumber ||
        topCandidate.eurocode ||
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
      ? (nextAction.replace('ask_', '') === 'rain_sensor' ? 'rainSensor' : nextAction.replace('ask_', ''))
      : null;

    await updateSession(env, sessionToken, {
      vehicle: vehicleInfo,
      candidates: candidates.map((c: any) => c.id).filter((id: number) => typeof id === 'number'),
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
      candidates: candidates.slice(0, 5),
      accessories,
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

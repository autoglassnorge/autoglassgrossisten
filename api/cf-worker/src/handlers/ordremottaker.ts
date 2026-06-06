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

const DEFAULT_ACCESSORIES = [
  { sku: 'LIST-STD', name: 'List', price: 245, included: true, removable: false },
  { sku: 'LIM-STD', name: 'Lim', price: 189, included: true, removable: false },
  { sku: 'KLIPS-STD', name: 'Klips', price: 89, included: true, removable: true },
];

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
    // 3. Get or create session
    let sessionToken = body.session_token || '';
    let session = sessionToken ? await getSession(env, sessionToken) : null;
    if (!session) {
      sessionToken = await createSession(env);
      session = await getSession(env, sessionToken);
    }
    if (!session) {
      return errorResponse('Kunne ikke opprette session', 500);
    }

    // 4. Add user message
    await addMessage(env, sessionToken, 'user', body.message);

    // 5. NER extraction (hybrid: regex + LLM fallback)
    const nerResult = await extractVehicleHybrid(env, body.message);

    // 6. Search for candidates
    let candidates: GlassRecord[] = [];
    let vehicleInfo: { make: string; model: string; year: number } | undefined;

    if (nerResult.confidence >= 0.2) {
      if (nerResult.regnr) {
        console.log(`[Ordremottaker] Searching by regnr: ${nerResult.regnr}`);
        const searchResult = await searchByRegnr(nerResult.regnr, env);
        if (searchResult.httpStatus === 200) {
          const searchBody = searchResult.body as {
            candidates?: GlassRecord[];
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
        // Direct SQL (reliable) — try exact brand match first, then case-insensitive
        const { results } = await db
          .prepare("SELECT * FROM glass_catalog WHERE brand = ? AND year_from <= ? AND year_to >= ? LIMIT 100")
          .bind(nerResult.make, nerResult.year, nerResult.year)
          .all();
        let dbCandidates = (results || []) as GlassRecord[];
        if (dbCandidates.length === 0) {
          const { results: r2 } = await db
            .prepare("SELECT * FROM glass_catalog WHERE UPPER(brand) = UPPER(?) AND year_from <= ? AND year_to >= ? LIMIT 100")
            .bind(nerResult.make, nerResult.year, nerResult.year)
            .all();
          dbCandidates = (r2 || []) as GlassRecord[];
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

    // 8. Filter by position if specified
    if (nerResult.position && candidates.length > 0) {
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

    // 9. Generate AI response
    let aiResponse: string;
    let status: OrdremottakerResponse['status'];
    let nextAction: string | null = null;

    const confidence = nerResult.confidence;

    if (confidence < 0.3) {
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
      // We have candidates — use natural templates instead of LLM for common cases
      const pos = nerResult.position || 'glass';
      const make = vehicleInfo?.make || nerResult.make || '';
      const model = vehicleInfo?.model || nerResult.model || '';
      const year = vehicleInfo?.year || nerResult.year || '';
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

      if (nerResult.regnr) {
        aiResponse = `Forstått — ${vehicleDesc}, ${pos}. Her er glassene som passer basert på regnr ${nerResult.regnr}:`;
      } else if (nerResult.vin) {
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
    } else {
      // Partial understanding
      const parts: string[] = [];
      if (nerResult.make) parts.push(nerResult.make);
      if (nerResult.model) parts.push(nerResult.model);
      if (nerResult.year) parts.push(String(nerResult.year));
      if (nerResult.position) parts.push(nerResult.position);

      if (parts.length > 0) {
        aiResponse = `Jeg forstår at du trenger ${parts.join(' ')}. For å finne eksakt riktig glass, kan du oppgi registreringsnummer eller bekrefte årsmodellen?`;
      } else {
        aiResponse = 'Hei! Jeg hjelper deg å finne riktig bilglass. Kan du oppgi bilmerke, modell, årsmodell og hvilket glass du trenger (frontrute, bakrute, etc.)?';
      }
      status = 'clarification';
      nextAction = 'ask_vehicle_details';
    }

    // 10. Build default accessories
    const accessories = DEFAULT_ACCESSORIES;

    // 11. Build cart URL if recommendation and candidates exist
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

    // 12. Update session
    await updateSession(env, sessionToken, {
      vehicle: vehicleInfo,
      candidates: candidates.map((c: any) => c.id).filter((id: number) => typeof id === 'number'),
      status: status === 'recommendation' ? 'completed' : 'active',
    });

    // 13. Add AI message
    await addMessage(env, sessionToken, 'ai', aiResponse);

    // 14. Return response
    const response: OrdremottakerResponse = {
      status,
      ai_response: aiResponse,
      session_token: sessionToken,
      candidates: candidates.slice(0, 5),
      accessories,
      cart_url: cartUrl,
      confidence: confidence,
      next_action: nextAction || undefined,
    };

    return jsonResponse(response);
  } catch (e) {
    console.error(
      `[Ordremottaker] Handler error: ${e instanceof Error ? e.message : String(e)}`
    );
    return errorResponse('Intern feil i ordremottaker', 500);
  }
}

/**
 * Vehicle Wizard API handlers
 * Provides endpoints for the 5-step vehicle search wizard
 */

import type { Env } from "../types";
import { jsonResponse, errorResponse } from "../lib/cors";
import { fetchBovsoftVehicle, getCachedBovsoftVehicle, cacheBovsoftVehicle } from "../lib/bovsoft";
import { resolveKtype } from "../lib/ktype-resolver";
import { guessEquipment } from "../lib/scoring";
import { getEquipmentProfileForVehicle } from "../lib/equipment-profiles";
import { computeProfileMatchConfidence, selectCategoryProfile } from "../lib/equipment";

// ---------------------------------------------------------------------------
// GET /api/vehicle/ktype/:regnr
// Lookup kType by registration number (with Bovsoft + caching)
// ---------------------------------------------------------------------------

export async function handleVehicleKtypeLookup(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  const regnr = pathParts[pathParts.length - 1]?.toUpperCase().replace(/\s/g, "");

  if (!regnr || !/^[A-Z]{2}\d{4,5}$/.test(regnr)) {
    return errorResponse("Ugyldig registreringsnummer. Format: AB12345", 400);
  }

  try {
    // 1. Check KV cache first
    const cached = await getCachedBovsoftVehicle(env.GLASS_CATALOG, regnr);
    if (cached) {
      return jsonResponse({
        success: true,
        ktype: cached.ktype,
        vehicle: {
          brand: cached.brand,
          model: cached.model,
          year: cached.yearFrom || cached.yearTo || 0,
          yearFrom: cached.yearFrom,
          yearTo: cached.yearTo,
          body: cached.body,
          vin: cached.vin,
        },
        source: "cache",
      });
    }

    // 2. Fetch from Bovsoft API
    if (!env.BOVSOFT_CLIENT_ID || !env.BOVSOFT_SECCODE) {
      return errorResponse("Bovsoft API ikke konfigurert", 503);
    }

    const vehicle = await fetchBovsoftVehicle(regnr, env.BOVSOFT_CLIENT_ID, env.BOVSOFT_SECCODE);

    if (!vehicle) {
      return jsonResponse({
        success: false,
        error: "Fant ikke kjøretøy",
      });
    }

    // 3. Try to resolve/correct kType with TecDoc fallback
    const resolved = await resolveKtype(
      regnr,
      vehicle.ktype,
      {
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.yearFrom || vehicle.yearTo || 0,
      },
      env
    );

    // Use resolved kType if confidence is higher or Bovsoft had wrong/no kType
    // Lowered threshold to 0.6 to allow TecDoc fallback (confidence 0.65-0.70)
    const finalKtype = resolved.confidence > 0.6 ? resolved.ktype : vehicle.ktype;
    const source = resolved.source === 'tecdoc' ? 'bovsoft+tecdoc' : 'bovsoft';

    // 4. Cache the result
    await cacheBovsoftVehicle(env.GLASS_CATALOG, regnr, {
      ...vehicle,
      ktype: finalKtype,
    });

    return jsonResponse({
      success: true,
      ktype: finalKtype,
      vehicle: {
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.yearFrom || vehicle.yearTo || 0,
        yearFrom: vehicle.yearFrom,
        yearTo: vehicle.yearTo,
        body: vehicle.body,
        vin: vehicle.vin,
      },
      source,
    });
  } catch (e) {
    console.error(`[VehicleKtype] Error for regnr=${regnr}:`, e);
    return errorResponse("Kunne ikke slå opp kjøretøy", 500);
  }
}

// ---------------------------------------------------------------------------
// GET /api/vehicle/brands
// Get distinct brands from ktype_registry
// ---------------------------------------------------------------------------

export async function handleVehicleBrands(_request: Request, env: Env): Promise<Response> {
  try {
    const { results } = await env.GLASS_CATALOG_D1
      .prepare(`
        SELECT DISTINCT brand 
        FROM ktype_registry 
        WHERE brand IS NOT NULL AND brand != ''
        ORDER BY brand ASC
      `)
      .all();

    const brands = (results || []).map((r: any) => r.brand as string);

    return jsonResponse({ brands });
  } catch (e) {
    console.error("[VehicleBrands] Error:", e);
    return errorResponse("Kunne ikke hente merker", 500);
  }
}

// ---------------------------------------------------------------------------
// GET /api/vehicle/models?brand=X
// Get models for a specific brand from ktype_registry
// ---------------------------------------------------------------------------

export async function handleVehicleModels(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const brand = url.searchParams.get("brand")?.toUpperCase();

  if (!brand) {
    return errorResponse("Mangler 'brand' parameter", 400);
  }

  try {
    const { results } = await env.GLASS_CATALOG_D1
      .prepare(`
        SELECT DISTINCT model 
        FROM ktype_registry 
        WHERE brand = ? AND model IS NOT NULL AND model != ''
        ORDER BY model ASC
      `)
      .bind(brand)
      .all();

    const models = (results || []).map((r: any) => r.model as string);

    return jsonResponse({ models });
  } catch (e) {
    console.error(`[VehicleModels] Error for brand=${brand}:`, e);
    return errorResponse("Kunne ikke hente modeller", 500);
  }
}

// ---------------------------------------------------------------------------
// GET /api/vehicle/years?brand=X&model=Y
// Get year ranges for a specific brand+model from ktype_registry
// ---------------------------------------------------------------------------

export async function handleVehicleYears(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const brand = url.searchParams.get("brand")?.toUpperCase();
  const model = url.searchParams.get("model")?.toUpperCase();

  if (!brand || !model) {
    return errorResponse("Mangler 'brand' eller 'model' parameter", 400);
  }

  try {
    const { results } = await env.GLASS_CATALOG_D1
      .prepare(`
        SELECT 
          year_from,
          year_to,
          COUNT(*) as ktype_count
        FROM ktype_registry 
        WHERE brand = ? AND model = ?
          AND year_from IS NOT NULL
        GROUP BY year_from, year_to
        ORDER BY year_from DESC
      `)
      .bind(brand, model)
      .all();

    // Format year ranges
    const years = (results || []).map((r: any) => {
      const from = r.year_from;
      const to = r.year_to;
      
      if (from === to || !to) {
        return String(from);
      }
      return `${from}-${to}`;
    });

    // Remove duplicates and sort
    const uniqueYears = [...new Set(years)].sort((a, b) => {
      const yearA = parseInt(a.split("-")[0], 10);
      const yearB = parseInt(b.split("-")[0], 10);
      return yearB - yearA; // Newest first
    });

    return jsonResponse({ years: uniqueYears });
  } catch (e) {
    console.error(`[VehicleYears] Error for brand=${brand}, model=${model}:`, e);
    return errorResponse("Kunne ikke hente årsmodeller", 500);
  }
}

// ---------------------------------------------------------------------------
// GET /api/vehicle/products?ktype=X
// Get products by kType (for summary step)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /api/vehicle/debug/:regnr
// Debug kType resolution step-by-step (no caching)
// ---------------------------------------------------------------------------

export async function handleVehicleDebug(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  const regnr = pathParts[pathParts.length - 1]?.toUpperCase().replace(/\s/g, "");

  if (!regnr || !/^[A-Z]{2}\d{4,5}$/.test(regnr)) {
    return errorResponse("Ugyldig registreringsnummer", 400);
  }

  try {
    // 1. Fetch from Bovsoft (skip cache)
    const bovsoftVehicle = await fetchBovsoftVehicle(regnr, env.BOVSOFT_CLIENT_ID || "", env.BOVSOFT_SECCODE || "");

    if (!bovsoftVehicle) {
      return jsonResponse({ success: false, error: "Bovsoft fant ikke kjøretøy" });
    }

    // 2. Validate kType
    let validationResult: { isValid: boolean; dbBrand?: string; dbModel?: string } = { isValid: false };
    
    if (bovsoftVehicle.ktype) {
      const dbResult = await env.GLASS_CATALOG_D1
        .prepare(`SELECT brand, model FROM ktype_registry WHERE ktype = ? LIMIT 1`)
        .bind(bovsoftVehicle.ktype)
        .first<{ brand: string; model: string }>();
      
      if (dbResult) {
        const brandMatch = dbResult.brand.toUpperCase() === bovsoftVehicle.brand.toUpperCase();
        const modelMatch = 
          dbResult.model.toUpperCase().includes(bovsoftVehicle.model) ||
          bovsoftVehicle.model.includes(dbResult.model.toUpperCase());
        validationResult = {
          isValid: brandMatch && modelMatch,
          dbBrand: dbResult.brand,
          dbModel: dbResult.model,
        };
      }
    }

    // 3. Test each fallback step
    const year = bovsoftVehicle.yearFrom || bovsoftVehicle.yearTo || 0;
    const brand = bovsoftVehicle.brand;
    const model = bovsoftVehicle.model;

    // Exact match
    const exactMatch = await env.GLASS_CATALOG_D1
      .prepare(`SELECT ktype, brand, model, year_from, year_to FROM ktype_registry WHERE brand = ? AND model = ? AND year_from <= ? AND (year_to >= ? OR year_to IS NULL) LIMIT 1`)
      .bind(brand, model, year, year)
      .first<{ ktype: number; brand: string; model: string; year_from: number; year_to: number | null }>();

    // Partial match (first word only — avoid D1 SQLITE_ERROR on complex strings)
    const firstWord = model.split(/\s+/)[0].replace(/[^A-Z0-9]/gi, '');
    const partialMatch = firstWord.length >= 2 ? await env.GLASS_CATALOG_D1
      .prepare(`SELECT ktype, brand, model, year_from, year_to FROM ktype_registry WHERE brand = ? AND model LIKE ? AND year_from <= ? AND (year_to >= ? OR year_to IS NULL) LIMIT 1`)
      .bind(brand, `%${firstWord}%`, year, year)
      .first<{ ktype: number; brand: string; model: string; year_from: number; year_to: number | null }>() : null;

    // Generic match
    const genericModel = model
      .replace(/CARAVELLE/g, 'TRANSPORTER')
      .replace(/MULTIVAN/g, 'TRANSPORTER')
      .replace(/\s+V\s+/g, ' T5 ')
      .replace(/BUSS/g, '')
      .trim();
    const searchPattern = `%TRANSPORTER%T5%`;
    const genericMatch = await env.GLASS_CATALOG_D1
      .prepare(`SELECT ktype, brand, model, year_from, year_to FROM ktype_registry WHERE brand = ? AND model LIKE ? AND year_from <= ? AND (year_to >= ? OR year_to IS NULL) LIMIT 1`)
      .bind(brand, searchPattern, year, year)
      .first<{ ktype: number; brand: string; model: string; year_from: number; year_to: number | null }>();

    return jsonResponse({
      success: true,
      regnr,
      bovsoft: {
        ktype: bovsoftVehicle.ktype,
        brand: bovsoftVehicle.brand,
        model: bovsoftVehicle.model,
        yearFrom: bovsoftVehicle.yearFrom,
        yearTo: bovsoftVehicle.yearTo,
      },
      validation: validationResult,
      fallbackSteps: {
        exactMatch: exactMatch || null,
        partialMatch: partialMatch || null,
        genericModel,
        searchPattern,
        genericMatch: genericMatch || null,
      },
      final: {
        wouldUse: validationResult.isValid ? 'bovsoft' : (genericMatch || partialMatch || exactMatch ? 'tecdoc' : 'bovsoft_fallback'),
        suggestedKtype: validationResult.isValid 
          ? bovsoftVehicle.ktype 
          : (genericMatch?.ktype || partialMatch?.ktype || exactMatch?.ktype || bovsoftVehicle.ktype),
      },
    });
  } catch (e) {
    console.error(`[VehicleDebug] Error for regnr=${regnr}:`, e);
    return jsonResponse({
      success: false,
      error: "Debug feilet",
      details: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
      bovsoftClientIdSet: !!env.BOVSOFT_CLIENT_ID,
      bovsoftSecCodeSet: !!env.BOVSOFT_SECCODE,
    }, 500);
  }
}

export async function handleVehicleProducts(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const ktypeParam = url.searchParams.get("ktype");
  const brandParam = url.searchParams.get("brand");
  const modelParam = url.searchParams.get("model");
  const yearFromParam = url.searchParams.get("yearFrom");
  const yearToParam = url.searchParams.get("yearTo");

  if (!ktypeParam) {
    return errorResponse("Mangler 'ktype' parameter", 400);
  }

  const ktype = parseInt(ktypeParam, 10);
  if (isNaN(ktype)) {
    return errorResponse("Ugyldig kType", 400);
  }

  let ktypeVehicle: { brand: string; model: string; year_from: number; year_to: number | null } | null = null;

  try {
    // 1. Use provided vehicle params (from Bovsoft cache) if available, else fall back to ktype_registry
    if (brandParam && yearFromParam) {
      ktypeVehicle = {
        brand: brandParam,
        model: modelParam || '',
        year_from: parseInt(yearFromParam, 10) || 0,
        year_to: yearToParam ? parseInt(yearToParam, 10) : null,
      };
    } else {
      // Fallback: lookup from ktype_registry (TecDoc data — may not match Bovsoft ktypes)
      ktypeVehicle = await env.GLASS_CATALOG_D1
        .prepare(`SELECT brand, model, year_from, year_to FROM ktype_registry WHERE ktype = ? LIMIT 1`)
        .bind(ktype)
        .first<{ brand: string; model: string; year_from: number; year_to: number | null }>() || null;
    }

    const vehicleYear = ktypeVehicle?.year_from || 0;
    const guessed = ktypeVehicle
      ? guessEquipment(ktypeVehicle.brand, ktypeVehicle.model, vehicleYear)
      : null;

    // 2. Fetch glass candidates (try kType first, then fallback to brand+model+year)
    let results: any[] = [];
    let usedFallback = false;

    const ktypeResults = await env.GLASS_CATALOG_D1
      .prepare(`
        SELECT 
          id,
          eurocode,
          brand,
          model,
          description as title,
          description,
          type_description as typeDescription,
          year_from as yearFrom,
          year_to as yearTo,
          article_number as articleNumber,
          price,
          stock_status as stockStatus,
          image_url as imageUrl,
          category,
          nags_codes,
          position,
          properties,
          heated,
          rain_sensor as rainSensor,
          adas,
          hud,
          acoustic,
          antenna,
          solar,
          tinted
        FROM glass_catalog 
        WHERE ktype = ?
        LIMIT 100
      `)
      .bind(ktype)
      .all();

    results = ktypeResults.results || [];

    // Fallback: if no kType matches, search by brand+year from ktype_registry
    // (model matching is too fragile — use broader brand+year filter)
    if (results.length === 0 && ktypeVehicle) {
      usedFallback = true;
      const fbYearTo = ktypeVehicle.year_to || ktypeVehicle.year_from || 9999;
      const fbYearFrom = ktypeVehicle.year_from || 0;
      const fallbackResults = await env.GLASS_CATALOG_D1
        .prepare(`
          SELECT 
            id,
            eurocode,
            brand,
            model,
            description as title,
            description,
            type_description as typeDescription,
            year_from as yearFrom,
            year_to as yearTo,
            article_number as articleNumber,
            price,
            stock_status as stockStatus,
            image_url as imageUrl,
            category,
            nags_codes,
            position,
            properties,
            heated,
            rain_sensor as rainSensor,
            adas,
            hud,
            acoustic,
            antenna,
            solar,
            tinted
          FROM glass_catalog 
          WHERE brand = ? 
            AND year_from <= ? 
            AND (year_to >= ? OR year_to IS NULL)
          LIMIT 100
        `)
        .bind(
          ktypeVehicle.brand,
          fbYearTo,
          fbYearFrom
        )
        .all();
      results = fallbackResults.results || [];
    }

    // 3. Score and map candidates
    const categoryToTypeCode: Record<string, { code: string; desc: string }> = {
      'frontrute': { code: 'F', desc: 'Frontrute' },
      'bakrute': { code: 'B', desc: 'Bakrute' },
      'siderute': { code: 'SFB1', desc: 'Siderute' },
      'dørrute-frem': { code: 'DFF', desc: 'Dørrute fremme' },
      'dørrute-bak': { code: 'DFB', desc: 'Dørrute bak' },
      'annet': { code: 'OTHER', desc: 'Annet' },
    };

    const products = (results || []).map((r: any) => {
      // Parse full properties JSON from D1 if available
      let fullProperties: Record<string, any> = {};
      try {
        if (r.properties) {
          fullProperties = JSON.parse(r.properties);
        }
      } catch {
        fullProperties = {};
      }

      const recordProps = {
        heated: !!(r.heated ?? fullProperties.heated),
        rainSensor: !!(r.rainSensor ?? fullProperties.rainSensor),
        adas: !!(r.adas ?? fullProperties.adas),
        hud: !!(r.hud ?? fullProperties.hud),
        acoustic: !!(r.acoustic ?? fullProperties.acoustic),
        antenna: !!(r.antenna ?? fullProperties.antenna),
        solar: !!(r.solar ?? fullProperties.solar),
        tinted: !!(r.tinted ?? fullProperties.tinted),
        green: !!fullProperties.green,
        blue: !!fullProperties.blue,
        coated: !!fullProperties.coated,
        encapsulated: !!fullProperties.encapsulated,
        laminated: !!fullProperties.laminated,
        darkGreen: !!fullProperties.darkGreen,
        laneAssist: !!fullProperties.laneAssist,
      };

      // Compute equipment match score
      let score = 0;
      if (guessed) {
        if (guessed.adas > 0.3 && recordProps.adas) score += 20;
        if (guessed.rainSensor > 0.3 && recordProps.rainSensor) score += 14;
        if (guessed.heated > 0.3 && recordProps.heated) score += 10;
        if (guessed.hud > 0.3 && recordProps.hud) score += 10;
        if (guessed.acoustic > 0.3 && recordProps.acoustic) score += 8;
        if (guessed.antenna > 0.3 && recordProps.antenna) score += 6;
        if (guessed.camera > 0.3 && recordProps.darkGreen) score += 6; // proxy
        // Penalize mismatches
        if (guessed.adas < 0.2 && recordProps.adas) score -= 8;
        if (guessed.hud < 0.2 && recordProps.hud) score -= 4;
        if (guessed.rainSensor < 0.2 && recordProps.rainSensor) score -= 3;
      }

      // Category boost
      const cat = r.category?.toLowerCase();
      if (cat === 'frontrute') score += 15;
      else if (cat === 'bakrute') score += 5;

      // Year compatibility
      if (vehicleYear && r.yearFrom && r.yearTo) {
        if (vehicleYear >= r.yearFrom && vehicleYear <= r.yearTo) score += 10;
        else if (vehicleYear >= r.yearFrom - 2 && vehicleYear <= r.yearTo + 2) score += 3;
      }

      // Type code mapping
      let typeCode: string;
      let typeCodeDesc: string;
      try {
        const nags = r.nags_codes ? JSON.parse(r.nags_codes) : [];
        if (Array.isArray(nags) && nags.length > 0) {
          typeCode = nags[0];
          typeCodeDesc = r.typeDescription || categoryToTypeCode[r.category]?.desc || r.category;
        } else {
          typeCode = categoryToTypeCode[r.category]?.code || 'OTHER';
          typeCodeDesc = r.typeDescription || categoryToTypeCode[r.category]?.desc || r.category;
        }
      } catch {
        typeCode = categoryToTypeCode[r.category]?.code || 'OTHER';
        typeCodeDesc = r.typeDescription || categoryToTypeCode[r.category]?.desc || r.category;
      }

      return {
        id: r.id,
        eurocode: r.eurocode,
        brand: r.brand,
        model: r.model,
        title: r.title || r.description,
        description: r.description,
        typeDescription: r.typeDescription || typeCodeDesc,
        yearFrom: r.yearFrom,
        yearTo: r.yearTo,
        articleNumber: r.articleNumber,
        price: r.price || 0,
        stockStatus: r.stockStatus || 0,
        imageUrl: r.imageUrl || "",
        category: r.category,
        typeCode,
        typeCodeDesc,
        position: r.position,
        _score: score,
        properties: recordProps,
      };
    });

    // Sort by score descending, then frontrute first, then brand
    products.sort((a: any, b: any) => {
      if (b._score !== a._score) return b._score - a._score;
      const aFront = a.typeCode === 'F' ? 0 : 1;
      const bFront = b.typeCode === 'F' ? 0 : 1;
      if (aFront !== bFront) return aFront - bFront;
      return (a.brand || '').localeCompare(b.brand || '');
    });

    return jsonResponse({ products, meta: { ktype, usedFallback, total: products.length } });
  } catch (e) {
    console.error(`[VehicleProducts] Error for ktype=${ktype}:`, e);
    return jsonResponse({ 
      error: "Kunne ikke hente produkter", 
      debug: e instanceof Error ? e.message : String(e),
      ktype,
      ktypeVehicle: ktypeVehicle || null
    }, 500);
  }
}

// ---------------------------------------------------------------------------
// GET /api/vehicle/equipment-profile?regnr=<REGNR>
// Returns learned equipment profile for the vehicle + optional product scores
// ---------------------------------------------------------------------------

export async function handleVehicleEquipmentProfile(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const regnr = url.searchParams.get("regnr")?.toUpperCase().replace(/\s/g, "");
  const brand = url.searchParams.get("brand")?.toUpperCase();
  const model = url.searchParams.get("model")?.toUpperCase();
  const yearParam = url.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : null;
  const category = url.searchParams.get("category");

  // Optional: score a list of products passed in body
  let productsToScore: Array<{ id: number; properties: Record<string, unknown>; category?: string }> | null = null;
  if (request.method === "POST") {
    try {
      const body = await request.json() as { products?: Array<{ id: number; properties: Record<string, unknown>; category?: string }> };
      productsToScore = body.products || null;
    } catch {
      productsToScore = null;
    }
  }

  let vehicleBrand = brand || "";
  let vehicleModel = model || "";
  let vehicleYear = year;

  // If regnr provided, look up vehicle from Bovsoft cache / API
  if (regnr) {
    if (!/^[A-Z]{2}\d{4,5}$/.test(regnr)) {
      return errorResponse("Ugyldig registreringsnummer. Format: AB12345", 400);
    }

    try {
      const cached = await getCachedBovsoftVehicle(env.GLASS_CATALOG, regnr);
      if (cached) {
        vehicleBrand = cached.brand;
        vehicleModel = cached.model;
        vehicleYear = cached.yearFrom || cached.yearTo || null;
      } else if (env.BOVSOFT_CLIENT_ID && env.BOVSOFT_SECCODE) {
        const vehicle = await fetchBovsoftVehicle(regnr, env.BOVSOFT_CLIENT_ID, env.BOVSOFT_SECCODE);
        if (vehicle) {
          vehicleBrand = vehicle.brand;
          vehicleModel = vehicle.model;
          vehicleYear = vehicle.yearFrom || vehicle.yearTo || null;
          await cacheBovsoftVehicle(env.GLASS_CATALOG, regnr, vehicle);
        }
      }
    } catch (e) {
      console.error(`[EquipmentProfile] Vehicle lookup failed for ${regnr}:`, e);
    }
  }

  if (!vehicleBrand || !vehicleModel) {
    return errorResponse("Mangler kjøretøyinfo (regnr eller brand+model)", 400);
  }

  const profile = await getEquipmentProfileForVehicle(env, vehicleBrand, vehicleModel, vehicleYear);
  if (!profile) {
    return jsonResponse({
      found: false,
      vehicle: { brand: vehicleBrand, model: vehicleModel, year: vehicleYear },
      profile: null,
    });
  }

  const categoryProfile = category ? selectCategoryProfile(profile, category) : null;

  const response: Record<string, unknown> = {
    found: true,
    vehicle: { brand: vehicleBrand, model: vehicleModel, year: vehicleYear },
    profileKey: profile.key,
    profileLevel: profile.level,
    totalProducts: profile.totalProducts,
    categories: Object.keys(profile.cat),
    categoryProfiles: Object.fromEntries(
      Object.entries(profile.cat).map(([cat, p]) => [
        cat,
        {
          n: p.n,
          pos: p.pos,
          neg: p.neg,
          p: p.p,
          comb: p.comb,
        },
      ])
    ),
    categoryProfile: categoryProfile
      ? {
          category,
          total: categoryProfile.n,
          possible: categoryProfile.pos,
          impossible: categoryProfile.neg,
          likely: categoryProfile.p,
          combinations: categoryProfile.comb,
        }
      : null,
  };

  if (productsToScore && productsToScore.length > 0) {
    response.scores = productsToScore.map((product) => {
      const cat = product.category || category;
      const catProfile = cat ? selectCategoryProfile(profile, cat) : null;
      const fallbackProfile = catProfile || profile.cat.all || null;
      const match = fallbackProfile
        ? computeProfileMatchConfidence(product.properties as any, fallbackProfile, { includeExplanation: true })
        : null;
      return {
        id: product.id,
        confidence: match?.confidence ?? null,
        explanation: match?.explanation ?? null,
      };
    });
  }

  return jsonResponse(response);
}

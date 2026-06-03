/**
 * Vehicle Wizard API handlers
 * Provides endpoints for the 5-step vehicle search wizard
 */

import type { Env } from "../types";
import { jsonResponse, errorResponse } from "../lib/cors";
import { fetchBovsoftVehicle, getCachedBovsoftVehicle, cacheBovsoftVehicle } from "../lib/bovsoft";
import { resolveKtype } from "../lib/ktype-resolver";

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

  if (!ktypeParam) {
    return errorResponse("Mangler 'ktype' parameter", 400);
  }

  const ktype = parseInt(ktypeParam, 10);
  if (isNaN(ktype)) {
    return errorResponse("Ugyldig kType", 400);
  }

  try {
    const { results } = await env.GLASS_CATALOG_D1
      .prepare(`
        SELECT 
          id,
          eurocode,
          brand,
          model,
          description as title,
          description,
          year_from as yearFrom,
          year_to as yearTo,
          article_number as articleNumber,
          price,
          stock_status as stockStatus,
          image_url as imageUrl,
          type_code as typeCode,
          type_code_desc as typeCodeDesc,
          position,
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
        ORDER BY 
          CASE WHEN type_code = 'WS' THEN 0 ELSE 1 END,
          brand
        LIMIT 50
      `)
      .bind(ktype)
      .all();

    const products = (results || []).map((r: any) => ({
      id: r.id,
      eurocode: r.eurocode,
      brand: r.brand,
      model: r.model,
      title: r.title || r.description,
      description: r.description,
      yearFrom: r.yearFrom,
      yearTo: r.yearTo,
      articleNumber: r.articleNumber,
      price: r.price || 0,
      stockStatus: r.stockStatus || 0,
      imageUrl: r.imageUrl || "",
      typeCode: r.typeCode,
      typeCodeDesc: r.typeCodeDesc,
      position: r.position,
      properties: {
        heated: !!r.heated,
        rainSensor: !!r.rainSensor,
        adas: !!r.adas,
        hud: !!r.hud,
        acoustic: !!r.acoustic,
        antenna: !!r.antenna,
        solar: !!r.solar,
        tinted: !!r.tinted,
      },
    }));

    return jsonResponse({ products });
  } catch (e) {
    console.error(`[VehicleProducts] Error for ktype=${ktype}:`, e);
    return errorResponse("Kunne ikke hente produkter", 500);
  }
}

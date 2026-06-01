/**
 * Vehicle Wizard API handlers
 * Provides endpoints for the 5-step vehicle search wizard
 */

import type { Env } from "../types";
import { jsonResponse, errorResponse } from "../lib/cors";
import { fetchBovsoftVehicle, getCachedBovsoftVehicle, cacheBovsoftVehicle } from "../lib/bovsoft";

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

    // 3. Cache the result
    await cacheBovsoftVehicle(env.GLASS_CATALOG, regnr, vehicle);

    return jsonResponse({
      success: true,
      ktype: vehicle.ktype,
      vehicle: {
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.yearFrom || vehicle.yearTo || 0,
        yearFrom: vehicle.yearFrom,
        yearTo: vehicle.yearTo,
        body: vehicle.body,
        vin: vehicle.vin,
      },
      source: "bovsoft",
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

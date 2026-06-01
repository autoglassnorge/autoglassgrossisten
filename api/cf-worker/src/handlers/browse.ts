/**
 * Handler for /api/browse/* - Browse data fra JSON-filer lagt til KV
 */

import type { Env } from "../types";
import { jsonResponse, errorResponse } from "../lib/cors";

interface BrowseProduct {
  title: string;
  sku: string | null;
  typeCode: string | null;
  typeCodeRel: string | null;
  price: number | null;
}

interface BrowseYearEntry {
  url: string;
  products: BrowseProduct[];
}

interface BrowseModelData {
  [yearKey: string]: BrowseYearEntry;
}

interface BrowseBrandData {
  name: string;
  models: {
    [model: string]: BrowseModelData;
  };
}

interface BrandInfo {
  name: string;
  productCount: number;
}

export async function handleBrowseBrands(request: Request, env: Env): Promise<Response> {
  try {
    // Hent fra KV
    const data = await env.GLASS_CATALOG.get("browse:brands", "json") as { brands: BrandInfo[] } | null;
    
    if (!data) {
      return errorResponse("Browse data ikke tilgjengelig", 404);
    }
    
    return jsonResponse(data);
  } catch (e) {
    console.error("Browse brands error:", e);
    return errorResponse("Kunne ikke hente merker", 500);
  }
}

export async function handleBrowseBrand(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const brandName = url.pathname.replace("/api/browse/", "").replace(/\.json$/, "");
    
    if (!brandName) {
      return errorResponse("Mangler merkenavn", 400);
    }
    
    // Normalize brand name (samme som i BrowsePage)
    const safeName = brandName.replace(/\//g, "-").replace(/ /g, "_");
    
    // Hent fra KV
    const data = await env.GLASS_CATALOG.get(`browse:brand:${safeName}`, "json") as BrowseBrandData | null;
    
    if (!data) {
      return errorResponse("Merke ikke funnet", 404);
    }
    
    return jsonResponse(data);
  } catch (e) {
    console.error("Browse brand error:", e);
    return errorResponse("Kunne ikke hente merkedata", 500);
  }
}

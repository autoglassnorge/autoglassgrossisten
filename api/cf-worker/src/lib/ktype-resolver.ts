/**
 * kType Resolver - Hybrid approach
 * Uses Bovsoft (primary) + TecDoc fallback for regnr → kType lookup
 */

import type { Env } from "../types";
import { resolveTecDocKType } from "./tecdoc-resolver";

interface KtypeResult {
  ktype: number;
  brand: string;
  model: string;
  yearFrom: number;
  yearTo: number;
  source: 'bovsoft' | 'tecdoc' | 'none';
  confidence: number;
}

/**
 * Parse Norwegian regnr to extract series info for better matching
 */
function parseRegnrSeries(regnr: string): { prefix: string; series: string } | null {
  // Norwegian regnr patterns:
  // AB12345 (pre-2001), DE12345 (2001-2006), EL12345 (2006-2012), etc.
  const match = regnr.match(/^([A-Z]{2})(\d{5})$/);
  if (!match) return null;
  
  const prefix = match[1];
  const number = parseInt(match[2], 10);
  
  // Map prefix to approximate year range
  const prefixYears: Record<string, { from: number; to: number }> = {
    'AA': { from: 1971, to: 1987 }, 'AB': { from: 1971, to: 1987 },
    'AC': { from: 1987, to: 2001 }, 'AD': { from: 1987, to: 2001 },
    'AE': { from: 1987, to: 2001 }, 'AF': { from: 1987, to: 2001 },
    // Add more mappings as needed
    'DE': { from: 2001, to: 2006 }, 'DF': { from: 2001, to: 2006 },
    'EL': { from: 2006, to: 2012 }, 'EM': { from: 2006, to: 2012 },
    'HS': { from: 2012, to: 2016 }, 'HT': { from: 2012, to: 2016 },
    'SU': { from: 2016, to: 2020 }, 'SV': { from: 2016, to: 2020 },
  };
  
  const yearRange = prefixYears[prefix];
  if (!yearRange) return null;
  
  return { prefix, series: `${prefix}${number.toString().padStart(5, '0')}` };
}

/**
 * Query TecDoc in-memory resolver as fast fallback
 */
function queryTecDocResolverFallback(
  brand: string,
  model: string,
  year: number
): KtypeResult | null {
  try {
    const result = resolveTecDocKType(brand, model, year);
    if (result.status === 'no_match' || result.candidates.length === 0) {
      return null;
    }
    const best = result.candidates[0];
    if (result.status === 'resolved' || best.score >= 0.6) {
      return {
        ktype: best.ktype,
        brand: best.brand,
        model: best.model,
        yearFrom: best.yearFrom,
        yearTo: best.yearTo,
        source: 'tecdoc',
        confidence: best.score,
      };
    }
    return null;
  } catch (e) {
    console.error('[TecDoc Resolver Fallback] Error:', e);
    return null;
  }
}

/**
 * Query TecDoc kType registry in D1 as fallback
 */
async function queryTecDocFallback(
  db: D1Database,
  brand: string,
  model: string,
  year: number
): Promise<KtypeResult | null> {
  try {
    // Try exact match first
    const exactMatch = await db
      .prepare(`
        SELECT ktype, brand, model, year_from, year_to 
        FROM ktype_registry 
        WHERE brand = ? AND model = ? AND year_from <= ? AND (year_to >= ? OR year_to IS NULL)
        LIMIT 1
      `)
      .bind(brand.toUpperCase(), model.toUpperCase(), year, year)
      .first<{ ktype: number; brand: string; model: string; year_from: number; year_to: number }>();
    
    if (exactMatch) {
      return {
        ktype: exactMatch.ktype,
        brand: exactMatch.brand,
        model: exactMatch.model,
        yearFrom: exactMatch.year_from,
        yearTo: exactMatch.year_to || new Date().getFullYear(),
        source: 'tecdoc',
        confidence: 0.85
      };
    }
    
    // Try partial model match (bidirectional) — use first word only to avoid
    // D1 SQLITE_ERROR "LIKE or GLOB pattern too complex" on long model strings
    const firstWord = model.toUpperCase().split(/\s+/)[0].replace(/[^A-Z0-9]/g, '');
    const partialMatch = firstWord.length >= 2 ? await db
      .prepare(`
        SELECT ktype, brand, model, year_from, year_to 
        FROM ktype_registry 
        WHERE brand = ? AND model LIKE ? AND year_from <= ? AND (year_to >= ? OR year_to IS NULL)
        ORDER BY ABS(year_from - ?)
        LIMIT 1
      `)
      .bind(brand.toUpperCase(), `%${firstWord}%`, year, year, year)
      .first<{ ktype: number; brand: string; model: string; year_from: number; year_to: number }>() : null;
    
    if (partialMatch) {
      return {
        ktype: partialMatch.ktype,
        brand: partialMatch.brand,
        model: partialMatch.model,
        yearFrom: partialMatch.year_from,
        yearTo: partialMatch.year_to || new Date().getFullYear(),
        source: 'tecdoc',
        confidence: 0.70
      };
    }
    
    // Try generic model match (e.g., "CARAVELLE" → "TRANSPORTER")
    const genericModel = model.toUpperCase()
      .replace(/CARAVELLE/g, 'TRANSPORTER')
      .replace(/MULTIVAN/g, 'TRANSPORTER')
      .replace(/\s+V\s+/g, ' T5 ')  // VW Caravelle V → T5
      .replace(/BUSS/g, '')
      .trim();
    
    console.log(`[TecDoc Fallback] Trying generic model: "${genericModel}"`);
    
    if (genericModel !== model.toUpperCase()) {
      // Simplified query - just look for TRANSPORTER T5
      const searchPattern = `%TRANSPORTER%T5%`;
      console.log(`[TecDoc Fallback] Search pattern: "${searchPattern}"`);
      
      const genericMatch = await db
        .prepare(`
          SELECT ktype, brand, model, year_from, year_to 
          FROM ktype_registry 
          WHERE brand = ? AND model LIKE ? AND year_from <= ? AND (year_to >= ? OR year_to IS NULL)
          LIMIT 1
        `)
        .bind(brand.toUpperCase(), searchPattern, year, year)
        .first<{ ktype: number; brand: string; model: string; year_from: number; year_to: number }>();
      
      console.log(`[TecDoc Fallback] Generic match result:`, genericMatch ? `kType ${genericMatch.ktype}` : 'null');
      
      if (genericMatch) {
        return {
          ktype: genericMatch.ktype,
          brand: genericMatch.brand,
          model: genericMatch.model,
          yearFrom: genericMatch.year_from,
          yearTo: genericMatch.year_to || new Date().getFullYear(),
          source: 'tecdoc',
          confidence: 0.65
        };
      }
    }
    
    return null;
  } catch (e) {
    console.error('[TecDoc Fallback] Error:', e);
    return null;
  }
}

/**
 * Validate that kType matches the expected vehicle brand/model
 */
async function validateKtype(
  db: D1Database,
  ktype: number,
  expectedBrand: string,
  expectedModel: string
): Promise<boolean> {
  try {
    const result = await db
      .prepare(`SELECT brand, model FROM ktype_registry WHERE ktype = ? LIMIT 1`)
      .bind(ktype)
      .first<{ brand: string; model: string }>();
    
    if (!result) return false;
    
    // Check if brand matches (case insensitive)
    const brandMatch = result.brand.toUpperCase() === expectedBrand.toUpperCase();
    
    // Check if model matches (partial match is OK)
    const modelMatch = 
      result.model.toUpperCase().includes(expectedModel.toUpperCase()) ||
      expectedModel.toUpperCase().includes(result.model.toUpperCase());
    
    return brandMatch && modelMatch;
  } catch (e) {
    console.error('[validateKtype] Error:', e);
    return false;
  }
}

/**
 * Main kType resolver with hybrid approach
 */
export async function resolveKtype(
  regnr: string,
  bovsoftKtype: number | null,
  bovsoftVehicle: { brand: string; model: string; year: number } | null,
  env: Env
): Promise<KtypeResult> {
  
  console.log(`[resolveKtype] Starting resolution for ${regnr}: kType=${bovsoftKtype}, vehicle=${bovsoftVehicle?.brand} ${bovsoftVehicle?.model}`);
  
  // If we have vehicle info from Bovsoft/SVV
  if (bovsoftVehicle && bovsoftVehicle.brand && bovsoftVehicle.model) {
    
    // Validate Bovsoft kType if provided
    if (bovsoftKtype) {
      const isValid = await validateKtype(
        env.GLASS_CATALOG_D1,
        bovsoftKtype,
        bovsoftVehicle.brand,
        bovsoftVehicle.model
      );
      
      console.log(`[resolveKtype] Bovsoft kType ${bovsoftKtype} validation: ${isValid}`);
      
      if (isValid) {
        return {
          ktype: bovsoftKtype,
          brand: bovsoftVehicle.brand,
          model: bovsoftVehicle.model,
          yearFrom: bovsoftVehicle.year,
          yearTo: bovsoftVehicle.year + 5,
          source: 'bovsoft',
          confidence: 0.90
        };
      }
      
      // kType doesn't match vehicle - try TecDoc fallback
      console.log(`[resolveKtype] Bovsoft kType ${bovsoftKtype} invalid, trying TecDoc fallback`);
    }
    
    // Try TecDoc in-memory resolver FIRST (fast, no D1 round-trip)
    console.log(`[resolveKtype] Trying TecDoc resolver for ${bovsoftVehicle.brand} ${bovsoftVehicle.model} ${bovsoftVehicle.year}`);
    const resolverResult = queryTecDocResolverFallback(
      bovsoftVehicle.brand,
      bovsoftVehicle.model,
      bovsoftVehicle.year
    );
    if (resolverResult) {
      console.log(`[resolveKtype] TecDoc resolver found kType ${resolverResult.ktype} (score ${resolverResult.confidence})`);
      return resolverResult;
    }
    
    // Fallback to D1-based TecDoc query
    console.log(`[resolveKtype] Resolver missed, trying D1 fallback`);
    const tecdocResult = await queryTecDocFallback(
      env.GLASS_CATALOG_D1,
      bovsoftVehicle.brand,
      bovsoftVehicle.model,
      bovsoftVehicle.year
    );
    
    console.log(`[resolveKtype] TecDoc fallback result:`, tecdocResult ? `kType ${tecdocResult.ktype}` : 'null');
    
    if (tecdocResult) {
      return tecdocResult;
    }
  }
  
  // Fallback: return Bovsoft kType even if invalid (better than nothing)
  if (bovsoftKtype && bovsoftVehicle) {
    return {
      ktype: bovsoftKtype,
      brand: bovsoftVehicle.brand,
      model: bovsoftVehicle.model,
      yearFrom: bovsoftVehicle.year,
      yearTo: bovsoftVehicle.year + 5,
      source: 'bovsoft',
      confidence: 0.50
    };
  }
  
  // Return not found
  return {
    ktype: 0,
    brand: '',
    model: '',
    yearFrom: 0,
    yearTo: 0,
    source: 'none',
    confidence: 0
  };
}

export { KtypeResult };

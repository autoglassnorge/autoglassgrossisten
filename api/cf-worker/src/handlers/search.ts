/**
 * Main search orchestrator: regnr → SVV → kType → D1 candidates → scoring → response.
 */

import type { Env, GlassRecord, SearchResult, BovsoftVehicle, GroundTruthRecord } from "../types";
import type { TecdocVehicle, SvvFetchResult } from "../providers/svv";
import { fetchSvvEnkeltoppslag } from "../providers/svv";
import { fetchBiluppgifterVehicle } from "../providers/biluppgifter-svv-backup";
import { getCachedSvvVehicle, cacheSvvVehicle } from "../lib/svv-cache";
import { getCachedBovsoftVehicle, fetchBovsoftVehicle, cacheBovsoftVehicle } from "../lib/bovsoft";
import { normalizeBrand, getBrandAliases } from "../lib/brand";
import { findKtypeByVehicle } from "../lib/ktype-family-lookup";
import {
  queryByEurocode,
  queryVehicleFingerprint,
  queryByBrandAndYear,
  queryByBrandOnly,
  queryByKtype,
  queryByKtypes,
  queryKtypeRegistry,
  queryKtypeMapping,
  insertKtypeMatch,
  queryCalibrationRequirements,
  queryGroundTruth,
  queryGroundTruthByVehicle,
  queryFuzzyBrandYear,
  queryTecdocByKtype,
  queryTecdocKtypeByVehicle,
  querySvvTecdocMatch,
  KTYPE_CONFIDENCE_THRESHOLD,
} from "../lib/db";
import { fetchBiluppgifterEquipment, inferRecordEquipment, detectFlagsFromOem, computeEquipmentMatch, applyEquipmentFilter } from "../lib/equipment";
import { decodeVwTransporterBody, decodeVin, inferBodyFromSvvData } from "../lib/vin-decoder";
import { parseGenerationFromDescription } from "../lib/generation";
import { scoreCandidate, modelMatches, yearCompatible, guessEquipment } from "../lib/scoring";
import { groundTruthToCandidates, inferTypeCodeFromRecord, groupByTypeCode } from "../lib/ground-truth";
import { sha256, saveSearchResult, getLearnedEquipment, getLearnedByVinPrefix } from "../lib/learning";
import { normalizeRecord } from "../lib/normalize";
import { lookupNagsByVehicle } from "../nags-by-vehicle";
import { resolveGlass, upsertGlassRule } from "../vin-glass-resolver";
import { resolveTecDocKType } from "../lib/tecdoc-resolver";

export type { SearchResult };

export function filterKtypeCandidatesForVehicle(
  candidates: GlassRecord[],
  vehicle: Pick<TecdocVehicle, "make" | "model" | "year">
): GlassRecord[] {
  const brands = getBrandAliases(vehicle.make).map((b) => b.toUpperCase());
  return candidates.filter((candidate) => {
    const brand = (candidate.brand || "").toUpperCase();
    if (!brands.includes(brand)) return false;
    if (!yearCompatible(candidate, vehicle.year, vehicle.make, vehicle.model)) return false;
    return modelMatches(vehicle.model, candidate.model, vehicle.make);
  });
}

const DRIVER_TYPE_CODES = new Set(["DFF", "DFB", "DFFV", "DFBV", "SFB1", "SFB2", "SFB3"]);
const PASSENGER_TYPE_CODES = new Set(["DPF", "DPB", "DPFV", "DPBV", "SPB1", "SPB2", "SPB3"]);

function normalizedRecordCategory(record: GlassRecord): string {
  const category = (record.category || "").toLowerCase();
  const typeCode = (record.typeCode || "").toUpperCase();
  const text = `${record.typeCodeDesc || ""} ${record.description || ""}`.toLowerCase();

  if (category === "frontrute") return "frontrute";
  if (category === "bakrute") return "bakrute";
  if (category.includes("dør") || category.includes("dor")) return "dørglass";
  if (category.includes("side") || category.includes("siderute") || category.includes("ventil")) return "sideglass";

  if (typeCode === "F" || text.includes("frontrute")) return "frontrute";
  if (typeCode === "B" || text.includes("bakrute")) return "bakrute";
  if (typeCode.startsWith("D") || text.includes("dørrute") || text.includes("dorrute")) return "dørglass";
  if (typeCode.startsWith("S") || text.includes("siderute") || text.includes("ventilrute")) return "sideglass";
  return category || "annet";
}

function normalizedPosition(record: GlassRecord): "driver" | "passenger" | "center" | "both" | null {
  if (record.position === "driver" || record.position === "passenger" || record.position === "center" || record.position === "both") {
    return record.position;
  }

  const typeCode = (record.typeCode || "").toUpperCase();
  if (DRIVER_TYPE_CODES.has(typeCode)) return "driver";
  if (PASSENGER_TYPE_CODES.has(typeCode)) return "passenger";

  const text = `${record.typeCodeDesc || ""} ${record.description || ""}`.toLowerCase();
  // Driver side (venstre i Norge) — expanded keyword list
  if (text.includes("førerside") || text.includes("foererside") || text.includes("venstre") ||
      text.includes("fører") || text.includes("foerer") || text.includes("fv") ||
      text.includes("v.s") || text.includes("v/s") || text.includes("v.s.") ||
      /\bvs\b/.test(text) || /\bfv\b/.test(text) || /\bv\.s\b/.test(text)) return "driver";
  // Passenger side (høyre i Norge) — expanded keyword list
  if (text.includes("passasjer") || text.includes("passasjerside") || text.includes("høyre") ||
      text.includes("hoyre") || text.includes("fh") || text.includes("h.s") ||
      text.includes("h/s") || text.includes("h.s.") ||
      /\bhs\b/.test(text) || /\bfh\b/.test(text) || /\bh\.s\b/.test(text)) return "passenger";
  return null;
}

export function recordMatchesGlassSelection(
  record: GlassRecord,
  categoryFilter?: string,
  positionFilter?: "driver" | "passenger" | "center" | "both"
): boolean {
  if (categoryFilter) {
    const wanted = categoryFilter.toLowerCase();
    const category = normalizedRecordCategory(record);
    if (wanted === "siderute" || wanted === "sideglass") {
      if (category !== "sideglass") return false;
    } else if (wanted === "dørrute" || wanted === "dørglass" || wanted === "dorute" || wanted === "dorglass") {
      if (category !== "dørglass") return false;
    } else if (category !== wanted) {
      return false;
    }
  }

  if (positionFilter) {
    const position = normalizedPosition(record);
    if (!position) return false;
    if (position !== "both" && position !== positionFilter) return false;
  }

  return true;
}

export async function searchByRegnr(
  regnr: string,
  env: Env,
  categoryFilter?: string,
  userEquipmentAnswers?: import("../lib/equipment").UserEquipmentAnswers,
  positionFilter?: "driver" | "passenger" | "center" | "both"
): Promise<SearchResult> {
  try {
    // 1. Lookup vehicle via SVV
    let svvCacheHit = false;
    let svvResult: SvvFetchResult;
    const cachedVehicle = await getCachedSvvVehicle(env.GLASS_CATALOG, regnr);
    if (cachedVehicle) {
      svvResult = { status: "ok", vehicle: cachedVehicle };
      svvCacheHit = true;
    } else {
      svvResult = await fetchSvvEnkeltoppslag(regnr, env.SVV_API_KEY);
      if (svvResult.status === "ok") {
        await cacheSvvVehicle(env.GLASS_CATALOG, regnr, svvResult.vehicle);
      }
    }
    // 1b. Fallback til Biluppgifter hvis SVV er nede
    let biluppgifterUsed = false;
    if (svvResult.status !== "ok") {
      // Prøv Biluppgitter som backup ved upstream_error, parse_error, eller auth_error
      if (svvResult.status === "upstream_error" || svvResult.status === "parse_error" || svvResult.status === "auth_error") {
        console.log(`[Backup] SVV failed with ${svvResult.status}, trying Biluppgifter...`);
        const biluppgifterResult = await fetchBiluppgifterVehicle(regnr, env.BILUPPGIFTER_API_KEY);
        
        if (biluppgifterResult.status === "ok") {
          console.log(`[Backup] Biluppgitter success for ${regnr}`);
          svvResult = { status: "ok", vehicle: biluppgifterResult.vehicle };
          biluppgifterUsed = true;
        } else {
          console.warn(`[Backup] Biluppgitter also failed: ${biluppgifterResult.status}`);
        }
      }
      
      // 1c. Fallback til Bovsoft cache hvis både SVV og Biluppgitter feiler
      let bovsoftUsed = false;
      if (svvResult.status !== "ok") {
        const bovsoftVehicle = await getCachedBovsoftVehicle(env.GLASS_CATALOG, regnr);
        if (bovsoftVehicle && bovsoftVehicle.brand && bovsoftVehicle.yearFrom > 0) {
          svvResult = {
            status: "ok",
            vehicle: {
              regno: regnr,
              make: normalizeBrand(bovsoftVehicle.brand),
              model: bovsoftVehicle.model || "",
              year: bovsoftVehicle.yearFrom,
              vin: "",
              typeCode: "",
              fuelCode: "",
              engineCode: "",
              length: undefined,
              seats: undefined,
              gvwr: undefined,
              firstRegDate: undefined,
              lastRegDate: undefined,
              status: "Registrert",
              k_type: 0,
            } as TecdocVehicle,
          };
          bovsoftUsed = true;
        }
      }
      
      // Hvis fortsatt ikke OK, returner feil
      if (svvResult.status !== "ok") {
        switch (svvResult.status) {
          case "not_configured":
            return {
              httpStatus: 503,
              retryAfter: 3600,
              body: { error: "Kjøretøyoppslag midlertidig utilgjengelig (konfigurasjon)", regnr, code: "svv_not_configured" },
            };
          case "auth_error":
            return {
              httpStatus: 503,
              retryAfter: 3600,
              body: { 
                error: "Kjøretøyoppslag midlertidig utilgjengelig", 
                regnr, 
                code: "svv_auth_error",
                backupUrl: `https://www.vegvesen.no/kjoretoy/kjop-og-salg/kjoretoyopplysninger/sjekk-kjoretoyopplysninger/?registreringsnummer=${encodeURIComponent(regnr)}`,
                message: "Du kan sjekke kjøretøyopplysninger direkte på vegvesen.no eller legge inn informasjon manuelt"
              },
            };
          case "upstream_error":
          case "parse_error":
            return {
              httpStatus: 503,
              retryAfter: 60,
              body: { 
                error: "Kjøretøyoppslag midlertidig utilgjengelig", 
                regnr, 
                code: "svv_upstream_error",
                backupUrl: `https://www.vegvesen.no/kjoretoy/kjop-og-salg/kjoretoyopplysninger/sjekk-kjoretoyopplysninger/?registreringsnummer=${encodeURIComponent(regnr)}`,
                message: "Du kan sjekke kjøretøyopplysninger direkte på vegvesen.no eller legge inn informasjon manuelt"
              },
            };
          case "not_found":
          default:
            return {
              httpStatus: 404,
              body: { error: "Kunne ikke slå opp registreringsnummer", regnr },
            };
        }
      }
    }

    const source = biluppgifterUsed ? "biluppgifter.backup" : "svv.enkeltoppslag";
    const vehicle: TecdocVehicle = svvResult.vehicle;
    const db = env.GLASS_CATALOG_D1;

    // Normalize make to match D1 catalog brand names
    vehicle.make = normalizeBrand(vehicle.make);

    // 1b. Look up vehicle fingerprint from SVV typeCode
    let fingerprint: { model_hint: string | null; models: string; year_from: number | null; year_to: number | null; sample_count: number } | null = null;
    try {
      fingerprint = await queryVehicleFingerprint(db, vehicle.make, vehicle.typeCode || "", vehicle.year);
      if (fingerprint) {
        console.log(`[Fingerprint] ${regnr}: ${vehicle.make} typeCode=${vehicle.typeCode} → ${fingerprint.model_hint} (${fingerprint.year_from}-${fingerprint.year_to})`);
        (vehicle as any)._fingerprint = fingerprint;
      }
    } catch {
      // vehicle_fingerprints table might not exist yet
    }

    // === Layer 0.5: SVV→TecDoc fuzzy match cache ===
    const LEGACY_REGNR = new Set([
      "CL500","EV400","PV544","SA105","MC040","MC105",
      "NV200","SL500","OM642","OM651","OM668",
      "EU0628","EU2028"
    ]);
    const isLegacy = LEGACY_REGNR.has(regnr.toUpperCase());

    let svvTecdocMatch = await querySvvTecdocMatch(db, regnr);
    if (svvTecdocMatch) {
      console.log(`[Layer 0.5] svv_tecdoc_matches hit for ${regnr}: ${svvTecdocMatch.confidence_level} (ktype=${svvTecdocMatch.ktype})`);
    }

    // High-confidence shortcut: exact/high → direct kType lookup, skip ground_truth + layers
    let layer05Candidates: GlassRecord[] | null = null;
    let layer05Confidence = "none";
    if (svvTecdocMatch && svvTecdocMatch.ktype && svvTecdocMatch.ktype > 0 &&
        (svvTecdocMatch.confidence_level === 'exact' || svvTecdocMatch.confidence_level === 'high')) {
      const ktypeDirect = await queryByKtype(db, svvTecdocMatch.ktype);
      const compatibleKtypeDirect = filterKtypeCandidatesForVehicle(ktypeDirect, vehicle);
      if (compatibleKtypeDirect.length > 0) {
        vehicle.k_type = svvTecdocMatch.ktype;
        layer05Candidates = compatibleKtypeDirect;
        layer05Confidence = svvTecdocMatch.confidence_level;
        console.log(`[Layer 0.5] Using cached kType ${svvTecdocMatch.ktype} for ${regnr}, skipping ground_truth`);
      } else if (ktypeDirect.length > 0) {
        console.warn(`[Layer 0.5] Ignoring cached kType ${svvTecdocMatch.ktype} for ${regnr}: ${ktypeDirect.length} catalog rows failed vehicle compatibility`);
      }
    }

    // 2. Check ground_truth database FIRST (layer -1) — skip if Layer 0.5 hit
    let groundTruth: GroundTruthRecord | null = null;
    let gtCandidates: GlassRecord[] = [];
    if (!layer05Candidates) {
      try {
        groundTruth = await queryGroundTruth(db, regnr);
        if (!groundTruth) {
          groundTruth = await queryGroundTruthByVehicle(db, vehicle.make, vehicle.model, vehicle.year);
        }
        if (groundTruth) {
          gtCandidates = await groundTruthToCandidates(db, groundTruth);
        }
      } catch {
        // Ground truth table might not exist yet
      }
    }

    // 3. Hybrid kType resolution
    let resolvedKtype: number | null = null;
    let ktypeSource = "none";

    // 3a. Check glass_rules
    try {
      const normalizedKey = [
        vehicle.make.toLowerCase().trim().replace(/\s+/g, "_"),
        vehicle.model.toLowerCase().trim().replace(/\s+/g, "_"),
        String(vehicle.year),
      ].join(":");
      const ruleResult = await db
        .prepare("SELECT ktype, confidence FROM glass_rules WHERE normalized_key = ? AND active = 1 ORDER BY confidence DESC, evidence_count DESC LIMIT 1")
        .bind(normalizedKey).first<{ ktype: number; confidence: number }>();
      if (ruleResult && ruleResult.ktype && ruleResult.confidence >= 0.75) {
        resolvedKtype = ruleResult.ktype;
        ktypeSource = "glass_rules";
        console.log(`[kType] Glass rule hit for ${regnr}: kType=${resolvedKtype}, conf=${ruleResult.confidence}`);
      }
    } catch {
      // glass_rules table might not exist yet
    }

    // 3b. Bovsoft kType — ALWAYS fetch for body type info even if kType already known
    let bovsoftVehicle: BovsoftVehicle | null = null;
    bovsoftVehicle = await getCachedBovsoftVehicle(env.GLASS_CATALOG, regnr);
    if (!bovsoftVehicle && env.BOVSOFT_CLIENT_ID && env.BOVSOFT_SECCODE && env.BOVSOFT_CLIENT_ID !== "NOT_SET") {
      bovsoftVehicle = await fetchBovsoftVehicle(regnr, env.BOVSOFT_CLIENT_ID, env.BOVSOFT_SECCODE);
      if (bovsoftVehicle) {
        await cacheBovsoftVehicle(env.GLASS_CATALOG, regnr, bovsoftVehicle);
      }
    }
    // Use Bovsoft kType if we don't have one yet, OR if it matches our existing kType (higher confidence)
    if (bovsoftVehicle && bovsoftVehicle.ktype > 0) {
      if (!resolvedKtype) {
        resolvedKtype = bovsoftVehicle.ktype;
        ktypeSource = "bovsoft";
      } else if (resolvedKtype === bovsoftVehicle.ktype) {
        // Bovsoft confirms our existing kType — upgrade confidence
        ktypeSource = ktypeSource === "glass_rules" ? "glass_rules+bovsoft" : ktypeSource;
      }
    }

    // 3c. Fallback: resolveGlass via vPIC or paid APIs
    if (!resolvedKtype && vehicle.vin) {
      try {
        const glassResult = await resolveGlass({
          db,
          vin: vehicle.vin,
          opening: "windshield",
          market: "EU",
          mode: "auto",
          regnr,
          vehicleMake: vehicle.make,
          vehicleModel: vehicle.model,
          vehicleYear: vehicle.year,
          vincarioApiKey: env.VINCARIO_API_KEY,
          vincarioSecretKey: env.VINCARIO_SECRET_KEY,
          macsVisApiKey: env.MACS_VIS_API_KEY,
          agmApiKey: env.AGM_API_KEY,
        });
        if (glassResult.status === "resolved" && glassResult.match?.ktype) {
          resolvedKtype = glassResult.match.ktype;
          ktypeSource = glassResult.paidLookupUsed ? "paid_api" : "vpic_rules";
        }
      } catch (e) {
        console.warn(`[kType] resolveGlass fallback failed for ${regnr}:`, e);
      }
    }

    // 3d. TecDoc in-memory resolver fallback (fast, no external API call)
    if (!resolvedKtype && vehicle.make && vehicle.model) {
      try {
        const tecdocResult = resolveTecDocKType(vehicle.make, vehicle.model, vehicle.year);
        if (tecdocResult.status !== 'no_match' && tecdocResult.candidates.length > 0) {
          const best = tecdocResult.candidates[0];
          if (tecdocResult.status === 'resolved' || best.score >= 0.6) {
            resolvedKtype = best.ktype;
            ktypeSource = 'tecdoc_resolver';
            console.log(`[kType] TecDoc resolver hit for ${regnr}: kType=${resolvedKtype}, brand=${best.brand}, model=${best.model}, score=${best.score.toFixed(2)}`);
          }
        }
      } catch (e) {
        console.warn(`[kType] TecDoc resolver failed for ${regnr}:`, e);
      }
    }

    // 3f. Cross-validate brand
    if (bovsoftVehicle && bovsoftVehicle.brand && vehicle.make) {
      const bovBrand = bovsoftVehicle.brand.toLowerCase().replace(/[^a-z]/g, "");
      const svvBrand = vehicle.make.toLowerCase().replace(/[^a-z]/g, "");
      if (bovBrand !== svvBrand && !bovBrand.includes(svvBrand) && !svvBrand.includes(bovBrand)) {
        console.warn(`Brand mismatch for ${regnr}: SVV=${vehicle.make}, Bovsoft=${bovsoftVehicle.brand}`);
      }
    }

    // 3f. Validate kType against catalog rows before trusting it.
    // External/cached kType sources can be stale or mapped to another vehicle family.
    // If catalog rows exist for the kType but none match vehicle brand/model/year, do
    // not attach it to the vehicle; otherwise later scoring would penalize correct
    // brand/model candidates as "different kType".
    if (resolvedKtype && resolvedKtype > 0) {
      const ktypeRows = await queryByKtype(db, resolvedKtype);
      if (ktypeRows.length > 0 && filterKtypeCandidatesForVehicle(ktypeRows, vehicle).length === 0) {
        console.warn(`[kType] Rejecting ${ktypeSource} kType ${resolvedKtype} for ${regnr}: ${ktypeRows.length} catalog rows failed vehicle compatibility`);
        resolvedKtype = null;
        ktypeSource = "none";
      }
    }

    // 3g. Merge kType into vehicle + save to glass_rules
    if (resolvedKtype && resolvedKtype > 0) {
      vehicle.k_type = resolvedKtype;
      try {
        const normalizedKey = [
          vehicle.make.toLowerCase().trim().replace(/\s+/g, "_"),
          vehicle.model.toLowerCase().trim().replace(/\s+/g, "_"),
          String(vehicle.year),
        ].join(":");
        await upsertGlassRule(db, {
          normalizedKey,
          market: "EU",
          opening: "windshield",
          featureSig: "default",
          match: {
            ktype: resolvedKtype,
            confidence: ktypeSource === "bovsoft" ? 0.90 : 0.75,
            source: ktypeSource,
          },
        });
      } catch {
        // glass_rules might not exist yet
      }
    }

    // 3g. Save SVV vehicle data to vin_decode_cache
    if (vehicle.vin) {
      try {
        await db.prepare(`
          INSERT INTO vin_decode_cache
            (vin, market, source, make, model, year, normalized_key, confidence, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+60 days'))
          ON CONFLICT(vin) DO UPDATE SET
            make = excluded.make, model = excluded.model, year = excluded.year,
            normalized_key = excluded.normalized_key, expires_at = excluded.expires_at
        `).bind(
          vehicle.vin, "EU", "svv", vehicle.make, vehicle.model, vehicle.year,
          [vehicle.make, vehicle.model, String(vehicle.year)].join(":").toLowerCase().replace(/\s+/g, "_"),
          0.85
        ).run();
      } catch {
        // vin_decode_cache might not exist yet
      }
    }

    const ktypeRegistryInfo = resolvedKtype ? await queryKtypeRegistry(db, resolvedKtype) : null;

    // Find matching glass in D1
    const candidates: GlassRecord[] = [];
    const candidateCodes = new Set<string>();
    let layer = 4;
    let confidence: string = "none";

    // === Layer 0.5: SVV→TecDoc cache (pre-empts ground_truth) ===
    if (layer05Candidates) {
      candidates.push(...layer05Candidates);
      layer05Candidates.forEach((c) => { if (c.eurocode) if (c.eurocode) candidateCodes.add(c.eurocode); });
      layer = 0;
      confidence = layer05Confidence;
    }

    // === Layer -1: Ground truth ===
    if (!layer05Candidates && gtCandidates.length > 0) {
      candidates.push(...gtCandidates);
      gtCandidates.forEach((c) => { if (c.eurocode) candidateCodes.add(c.eurocode); });
      layer = -1;
      confidence = "exact";
    }

    // === Layer 0: kType exact match ===
    if (!layer05Candidates && layer !== -1 && vehicle.k_type > 0) {
      const ktypeDirect = await queryByKtype(db, vehicle.k_type);
      const compatibleKtypeDirect = filterKtypeCandidatesForVehicle(ktypeDirect, vehicle);
      for (const c of compatibleKtypeDirect) {
        if (c.eurocode && !candidateCodes.has(c.eurocode)) {
          candidates.push(c);
          if (c.eurocode) candidateCodes.add(c.eurocode);
        }
      }
      if (compatibleKtypeDirect.length > 0) {
        layer = 0;
        confidence = "exact";
      } else if (ktypeDirect.length > 0) {
        console.warn(`[kType] Ignoring kType ${vehicle.k_type} for ${regnr}: ${ktypeDirect.length} catalog rows failed vehicle compatibility`);
      }

      if (compatibleKtypeDirect.length === 0) {
        const ktypeMappings = await queryKtypeMapping(db, vehicle.k_type);
        if (ktypeMappings.length > 0) {
          const topMapping = ktypeMappings[0];
          if (topMapping.frequency >= KTYPE_CONFIDENCE_THRESHOLD) {
            const mappedRecord = await queryByEurocode(db, topMapping.eurocode);
            if (mappedRecord && mappedRecord.eurocode && !candidateCodes.has(mappedRecord.eurocode)) {
              const brands = getBrandAliases(vehicle.make);
              const brandMatch = brands.some((b) => mappedRecord.brand?.toUpperCase() === b.toUpperCase());
              const yearMatch = yearCompatible(mappedRecord, vehicle.year, vehicle.make, vehicle.model);
              if (brandMatch && yearMatch) {
                candidates.push(mappedRecord);
                candidateCodes.add(mappedRecord.eurocode);
                layer = 0;
                confidence = topMapping.frequency >= 10 ? "exact" : "high";
              }
            }
          }
        }
      }
    }

    // === Layer 0.5: TecDoc fallback (collision-gated) ===
    if (!layer05Candidates && layer !== -1 && layer > 0) {
      try {
        const tecdocKtypes = await queryTecdocKtypeByVehicle(db, vehicle.make, vehicle.model, vehicle.year, 5);
        if (tecdocKtypes.length === 1) {
          // Unique/low-collision TecDoc match — treat as high-confidence fallback
          const tecdocMatch = tecdocKtypes[0];
          vehicle.k_type = tecdocMatch.ktype;
          ktypeSource = "tecdoc_fallback";
          console.log(`[kType] TecDoc fallback for ${regnr}: kType=${tecdocMatch.ktype}, brand=${tecdocMatch.tecdocBrand}, model=${tecdocMatch.tecdocModel}, conf=${tecdocMatch.confidenceTag}`);

          // Re-run Layer 0 with the resolved kType
          const ktypeDirect = await queryByKtype(db, vehicle.k_type);
          const compatibleKtypeDirect = filterKtypeCandidatesForVehicle(ktypeDirect, vehicle);
          for (const c of compatibleKtypeDirect) {
            if (c.eurocode && !candidateCodes.has(c.eurocode)) {
              candidates.push(c);
              if (c.eurocode) candidateCodes.add(c.eurocode);
            }
          }
          if (compatibleKtypeDirect.length > 0) {
            layer = 0;
            confidence = "exact";
          } else if (ktypeDirect.length > 0) {
            console.warn(`[kType] Ignoring TecDoc fallback kType ${vehicle.k_type} for ${regnr}: ${ktypeDirect.length} catalog rows failed vehicle compatibility`);
          }
        } else if (tecdocKtypes.length > 1) {
          // Multiple TecDoc matches — do not auto-resolve, but log for telemetry
          console.log(`[kType] TecDoc ambiguous for ${regnr}: ${tecdocKtypes.length} matches (${tecdocKtypes.map(t => t.ktype).join(", ")})`);
        }
      } catch {
        // tecdoc_ktype_registry might not exist yet — silently continue
      }
    }

    // === Layer 1-3: brand + model + year matching ===
    let debugL1Total = 0, debugL1Compatible = 0, debugL1Model = 0;
    let debugL3Total = 0, debugL3Compatible = 0, debugL3bTotal = 0, debugL3bCompatible = 0, debugL3bModel = 0;
    let debugFuzzyCount = 0;

    if (!layer05Candidates && layer !== -1) {
      let modelHint = vehicle.model.length >= 3 ? vehicle.model.toLowerCase() : undefined;
      let extraHints: string[] | undefined;
      const makeLower = vehicle.make.toLowerCase();
      if (makeLower.includes("volkswagen") || makeLower === "vw") {
        const vwVariants = ["transporter", "multivan", "caravelle", "california"];
        const matchedVariant = vwVariants.find((v) => vehicle.model.toLowerCase().includes(v));
        if (matchedVariant) {
          // All VW van variants share the same chassis family — use "transporter" as canonical
          // for D1 lookup since that's the model name used in glass_catalog
          if (matchedVariant !== "transporter") {
            modelHint = "transporter";
          }
          extraHints = vwVariants.filter((v) => v !== matchedVariant && v !== "transporter");
        }
      }

      // Volvo XC/S/V/C: D1 uses space ("XC 60"), SVV sends no space ("XC60")
      // Normalize to D1 format for SQL LIKE matching
      if (makeLower === "volvo") {
        const volvoModel = vehicle.model.toLowerCase();
        const volvoMatch = volvoModel.match(/^(xc|s|v|c)(\d+)$/);
        if (volvoMatch) {
          // "XC60" → "XC 60" to match D1 format
          modelHint = `${volvoMatch[1]} ${volvoMatch[2]}`;
          // Also search without space as fallback
          extraHints = [volvoModel];
        }
      }

      // Mercedes class names: D1 uses "SERIE W205", SVV sends "C-Klasse"
      // Generate extra hints with known W-codes for better SQL matching
      if (makeLower === "mercedes" || makeLower.includes("mercedes")) {
        const mercedesClassMap: Record<string, string[]> = {
          "c-klasse": ["w203", "w204", "w205", "w206"],
          "e-klasse": ["w210", "w211", "w212", "w213", "w214"],
          "s-klasse": ["w220", "w221", "w222", "w223"],
          "a-klasse": ["w168", "w169", "w176", "w177"],
          "b-klasse": ["w245", "w246", "w247"],
          "m-klasse": ["w163", "w164", "w166"],
          "gle-klasse": ["w166", "w167"],
          "g-klasse": ["w463", "w464"],
          "glc": ["x253", "c253", "x254", "c254"],
          "glb": ["x247"],
          "gla": ["x156", "h247"],
          "cla": ["c117", "c118"],
          "slk": ["r170", "r171", "r172"],
          "sl": ["r129", "r230", "r231"],
          "clk": ["c208", "c209"],
          "cls": ["c218", "c219", "c257"],
        };
        const mercedesModel = vehicle.model.toLowerCase();
        for (const [className, wCodes] of Object.entries(mercedesClassMap)) {
          if (mercedesModel.includes(className)) {
            extraHints = [...(extraHints || []), ...wCodes];
            break;
          }
        }
      }

      // ── Generic modelHint variant generation ────────────────────────────
      // D1 uses supplier conventions that often differ from SVV naming:
      //   "CX 5" (space)  vs  "CX-5" (hyphen)  vs  "CX5" (none)
      //   "MODEL 3"       vs  "Model3"
      //   "F-150"         vs  "F150"
      // Generate multiple variants and search them all for better coverage.
      function hintVariants(raw: string): string[] {
        const base = raw.toLowerCase().trim();
        const variants = new Set<string>();
        variants.add(base);
        variants.add(base.replace(/\s+/g, ""));          // no spaces
        variants.add(base.replace(/-/g, ""));            // no hyphens
        variants.add(base.replace(/\s+/g, "-"));         // spaces → hyphens
        variants.add(base.replace(/-/g, " "));            // hyphens → spaces
        variants.add(base.replace(/[^a-z0-9]+/g, ""));   // strip all non-alnum
        return Array.from(variants).filter((v) => v.length >= 2);
      }
      // Always add generic variants as extraHints (deduplicated)
      if (modelHint) {
        const genericVariants = hintVariants(vehicle.model);
        extraHints = [...new Set([...(extraHints || []), ...genericVariants])];
      }

      // Extract body type hint from Bovsoft for better filtering
      const bodyHint = bovsoftVehicle?.body || undefined;

      const l1 = await queryByBrandAndYear(db, vehicle.make, vehicle.year, modelHint, undefined, bodyHint);
      let l1Extra: GlassRecord[] = [];
      if (extraHints) {
        for (const hint of extraHints) {
          const extra = await queryByBrandAndYear(db, vehicle.make, vehicle.year, hint, undefined, bodyHint);
          l1Extra.push(...extra);
        }
      }
      const l1All = [...l1, ...l1Extra];
      const seen = new Set<string>();
      const l1Deduped = l1All.filter((r) => { if (!r.eurocode) return false; if (seen.has(r.eurocode)) return false; seen.add(r.eurocode); return true; });
      debugL1Total = l1Deduped.length;

      const l1Compatible = l1Deduped.filter((r) => yearCompatible(r, vehicle.year, vehicle.make, vehicle.model));
      const l1Model = l1Compatible.filter((r) => modelMatches(vehicle.model, r.model, vehicle.make));
      debugL1Compatible = l1Compatible.length;
      debugL1Model = l1Model.length;

      if (l1Model.length > 0) {
        for (const c of l1Model) {
          if (c.eurocode && !candidateCodes.has(c.eurocode)) {
            candidates.push(c);
            if (c.eurocode) candidateCodes.add(c.eurocode);
          }
        }
        if (layer > 1) { layer = 1; confidence = "high"; }
      } else if (l1Compatible.length > 0) {
        for (const c of l1Compatible) {
          if (c.eurocode && !candidateCodes.has(c.eurocode)) {
            candidates.push(c);
            if (c.eurocode) candidateCodes.add(c.eurocode);
          }
        }
        if (layer > 2) { layer = 2; confidence = "medium"; }
      } else {
        const l3 = await queryByBrandOnly(db, vehicle.make, modelHint);
        let l3Extra: GlassRecord[] = [];
        if (extraHints) {
          for (const hint of extraHints) {
            const extra = await queryByBrandOnly(db, vehicle.make, hint);
            l3Extra.push(...extra);
          }
        }
        const l3All = [...l3, ...l3Extra];
        const seen3 = new Set<string>();
        const l3Deduped = l3All.filter((r) => { if (!r.eurocode) return false; if (seen3.has(r.eurocode)) return false; seen3.add(r.eurocode); return true; });
        const l3Compatible = l3Deduped.filter((r) => yearCompatible(r, vehicle.year, vehicle.make, vehicle.model));
        if (l3Compatible.length > 0) {
          for (const c of l3Compatible) {
            if (c.eurocode && !candidateCodes.has(c.eurocode)) {
              candidates.push(c);
              if (c.eurocode) candidateCodes.add(c.eurocode);
            }
          }
          if (layer > 3) { layer = 3; confidence = "medium"; }
        } else {
          // Layer 3b
          const l3b = await queryByBrandOnly(db, vehicle.make);
          debugL3bTotal = l3b.length;
          const l3bCompatible = l3b.filter((r) => yearCompatible(r, vehicle.year, vehicle.make, vehicle.model));
          debugL3bCompatible = l3bCompatible.length;
          const l3bModel = l3bCompatible.filter((r) => modelMatches(vehicle.model, r.model, vehicle.make));
          debugL3bModel = l3bModel.length;
          if (l3bModel.length > 0) {
            for (const c of l3bModel) {
              if (c.eurocode && !candidateCodes.has(c.eurocode)) {
                candidates.push(c);
                if (c.eurocode) candidateCodes.add(c.eurocode);
              }
            }
            if (layer > 3) { layer = 3; confidence = "medium"; }
          } else if (l3bCompatible.length > 0) {
            for (const c of l3bCompatible) {
              if (c.eurocode && !candidateCodes.has(c.eurocode)) {
                candidates.push(c);
                if (c.eurocode) candidateCodes.add(c.eurocode);
              }
            }
            if (layer > 3) { layer = 3; confidence = "low"; }
          }
        }
      }
    }

    // === Layer 2.5: kType Family Matching fallback ===
    // When no exact kType match (Layer 0/0.5) but brand+model+year gives a family,
    // use family members to find candidates. This covers modern premium models
    // not directly in glass_catalog but with family siblings that are.
    let debugFamilyMatch: { familyId: number | null; ktypes: number[]; confidence: number; found: number } | null = null;
    if (!layer05Candidates && layer !== -1 && layer >= 2 && vehicle.make && vehicle.model && vehicle.year > 0) {
      try {
        const familyResult = await findKtypeByVehicle(db, vehicle.make, vehicle.model, vehicle.year);
        if (familyResult.ktypes.length > 0) {
          const familyCandidates = await queryByKtypes(db, familyResult.ktypes);
          let added = 0;
          for (const c of familyCandidates) {
            if (c.eurocode && !candidateCodes.has(c.eurocode)) {
              candidates.push(c);
              if (c.eurocode) candidateCodes.add(c.eurocode);
              added++;
            }
          }
          if (added > 0) {
            layer = 2;
            confidence = "medium";
            console.log(`[Layer 2.5] Family match for ${regnr}: familyId=${familyResult.familyId}, ktypes=${familyResult.ktypes.length}, added=${added}, conf=${familyResult.confidence.toFixed(2)}`);
          }
          debugFamilyMatch = {
            familyId: familyResult.familyId,
            ktypes: familyResult.ktypes,
            confidence: familyResult.confidence,
            found: added,
          };
        }
      } catch (e) {
        console.warn(`[Layer 2.5] Family lookup failed for ${regnr}:`, e instanceof Error ? e.message : String(e));
      }
    }

    // === Layer 5: Fuzzy Brand+Year fallback ===
    const hasWindshield = candidates.some((c) => c.category === "frontrute");
    const hasEnoughResults = candidates.length >= 15;
    if (!hasEnoughResults || !hasWindshield) {
      const fuzzyResults = await queryFuzzyBrandYear(db, vehicle.make, vehicle.year, vehicle.model, 50);
      debugFuzzyCount = fuzzyResults.length;
      for (const { record, score } of fuzzyResults) {
        if (record.eurocode && !candidateCodes.has(record.eurocode)) {
          (record as any)._fuzzyScore = score;
          candidates.push(record);
          candidateCodes.add(record.eurocode);
        }
      }
      if (layer > 3 && fuzzyResults.length > 0) {
        layer = 3;
        confidence = "low";
      }
    }

    // Decode VIN for all supported makes
    const vinInfo = vehicle.vin ? decodeVwTransporterBody(vehicle.vin, vehicle.length) : null;
    const unifiedVin = vehicle.vin ? decodeVin(vehicle.vin, vehicle.length) : null;
    // Pass Bovsoft body type (most accurate) to SVV body inference
    const svvBody = inferBodyFromSvvData(vehicle, bovsoftVehicle?.body || undefined);

    // Fetch equipment from Biluppgitter
    let factoryEquipment: {
      rainSensor: boolean;
      heated: boolean;
      acoustic: boolean;
      antenna: boolean;
      camera: boolean;
      adas: boolean;
      hud: boolean;
      source: string;
      guessed?: boolean;
      guessConfidence?: string;
      guessSource?: string;
    } | null = null;
    if (env.BILUPPGIFTER_API_KEY && env.BILUPPGIFTER_API_KEY !== "NOT_SET") {
      factoryEquipment = await fetchBiluppgifterEquipment(regnr, env.BILUPPGIFTER_API_KEY);
    }

    // Learning Engine
    const learned = await getLearnedEquipment(db, regnr);
    const learnedByVin = vehicle.vin ? await getLearnedByVinPrefix(db, vehicle.vin) : null;

    // Smart Equipment Guesser
    const guessedEquipment = guessEquipment(
      vehicle.make,
      vehicle.model,
      vehicle.year,
      unifiedVin?.generation || parseGenerationFromDescription(vehicle.model)
    );

    // Merge equipment sources
    let effectiveEquipment: typeof factoryEquipment;
    let equipSource = "none";

    if (factoryEquipment) {
      effectiveEquipment = { ...factoryEquipment, source: "biluppgifter" };
      equipSource = "biluppgifter";
    } else if (learned && learned.search_count >= 2) {
      effectiveEquipment = {
        rainSensor: learned.equipment.rainSensor,
        heated: learned.equipment.heated,
        acoustic: learned.equipment.acoustic,
        antenna: learned.equipment.antenna,
        camera: learned.equipment.camera,
        adas: learned.equipment.adas,
        hud: learned.equipment.hud,
        source: "learned",
        guessed: true,
        guessConfidence: learned.search_count >= 5 ? "high" : "medium",
        guessSource: "search_history",
      };
      equipSource = "learned";
    } else if (learnedByVin && learnedByVin.count >= 3) {
      effectiveEquipment = {
        rainSensor: learnedByVin.equipment.rainSensor,
        heated: learnedByVin.equipment.heated,
        acoustic: learnedByVin.equipment.acoustic,
        antenna: learnedByVin.equipment.antenna,
        camera: learnedByVin.equipment.camera,
        adas: learnedByVin.equipment.adas,
        hud: learnedByVin.equipment.hud,
        source: "learned_vin",
        guessed: true,
        guessConfidence: learnedByVin.count >= 10 ? "high" : "medium",
        guessSource: "vin_prefix_history",
      };
      equipSource = "learned_vin";
    } else if (guessedEquipment.confidence !== "none") {
      effectiveEquipment = {
        rainSensor: guessedEquipment.rainSensor >= 0.5,
        heated: guessedEquipment.heated >= 0.5,
        acoustic: guessedEquipment.acoustic >= 0.5,
        antenna: guessedEquipment.antenna >= 0.5,
        camera: guessedEquipment.camera >= 0.5,
        adas: guessedEquipment.adas >= 0.5,
        hud: guessedEquipment.hud >= 0.5,
        source: "catalog_guess",
        guessed: true,
        guessConfidence: guessedEquipment.confidence,
        guessSource: guessedEquipment.source,
      };
      equipSource = "catalog_guess";
    } else {
      effectiveEquipment = {
        rainSensor: false,
        heated: false,
        acoustic: false,
        antenna: false,
        camera: false,
        adas: false,
        hud: false,
        source: "none",
      };
    }

    // Equipment flags for scoring
    const vehicleFlags = {
      adas: effectiveEquipment.adas,
      rainSensor: effectiveEquipment.rainSensor,
      heated: effectiveEquipment.heated,
      acoustic: effectiveEquipment.acoustic,
      antenna: effectiveEquipment.antenna,
      camera: effectiveEquipment.camera,
      hud: effectiveEquipment.hud,
    };

    // Re-check ground_truth with equipment filtering
    if (!groundTruth || (groundTruth && groundTruth.make === vehicle.make)) {
      try {
        const gtWithEquipment = await queryGroundTruthByVehicle(db, vehicle.make, vehicle.model, vehicle.year, {
          adas: effectiveEquipment.adas,
          rainSensor: effectiveEquipment.rainSensor,
          heated: effectiveEquipment.heated,
          acoustic: effectiveEquipment.acoustic,
          antenna: effectiveEquipment.antenna,
          hud: effectiveEquipment.hud,
          camera: effectiveEquipment.camera,
        });
        if (gtWithEquipment) {
          groundTruth = gtWithEquipment;
          gtCandidates = await groundTruthToCandidates(db, groundTruth);
          layer = -1;
          confidence = "exact";
        }
      } catch {
        // Silently continue
      }
    }

    // Compute dominant prefix4
    const prefix4Counts = new Map<string, number>();
    candidates.forEach((c) => { if (c.prefix4) prefix4Counts.set(c.prefix4, (prefix4Counts.get(c.prefix4) || 0) + 1); });
    const dominantPrefix4 = Array.from(prefix4Counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];

    // === HARD EQUIPMENT FILTER (v2025-06-11) ===
    // If user has confirmed equipment answers, split candidates into exact vs uncertain
    let exactCandidates: GlassRecord[] = candidates;
    let uncertainCandidates: GlassRecord[] = [];
    const hasUserEquipment = userEquipmentAnswers && Object.values(userEquipmentAnswers).some((v) => v !== undefined);

    if (hasUserEquipment) {
      const { exact, uncertain } = applyEquipmentFilter(candidates, userEquipmentAnswers);
      exactCandidates = exact;
      uncertainCandidates = uncertain;
      console.log(
        `[EquipmentFilter] ${regnr}: exact=${exact.length}, uncertain=${uncertain.length}, answers=${JSON.stringify(userEquipmentAnswers)}`
      );
    }

    // Score and sort — prioritize exact candidates
    const scoreAndEnrich = (records: GlassRecord[], isUncertain: boolean) => {
      const scored = records
        .map((c) => ({
          c,
          score: scoreCandidate(c, vehicleFlags, vehicle, vinInfo, bovsoftVehicle || undefined, unifiedVin || undefined, dominantPrefix4)
            + (isUncertain ? -200 : 0), // penalize uncertain candidates
        }))
        .sort((a, b) => b.score - a.score);

      // Optional category filter
      const filtered = scored.filter((s) =>
        recordMatchesGlassSelection(s.c, categoryFilter, positionFilter)
      );

      return filtered.map((s) => {
        const record = s.c;
        const nagsCodes = lookupNagsByVehicle(
          record.brand || '',
          record.model || '',
          record.year_from,
          record.year_to,
          record.category || inferTypeCodeFromRecord(record) || 'annet'
        );
        const recordEquipment = inferRecordEquipment(record);
        const { match: equipmentMatch, diff: equipmentDiff } = computeEquipmentMatch(
          recordEquipment,
          effectiveEquipment
        );
        return {
          ...normalizeRecord(record),
          _score: s.score,
          _equipment: recordEquipment,
          equipmentMatch,
          equipmentDiff,
          nagsCodes: nagsCodes.length > 0 ? nagsCodes : undefined,
          _uncertain: isUncertain,
        };
      });
    };

    const exactWithEquipment = scoreAndEnrich(exactCandidates, false);
    const uncertainWithEquipment = scoreAndEnrich(uncertainCandidates, true);

    // HARD filter: when confirmed equipment has exact matches, normal candidates
    // must only contain those exact matches. Uncertain alternatives are exposed
    // only when there are zero exact matches, and are marked with _uncertain.
    const showUncertainAsFallback = !!hasUserEquipment && exactWithEquipment.length === 0;
    const candidatesWithEquipment = showUncertainAsFallback
      ? uncertainWithEquipment
      : exactWithEquipment;

    // Prefer frontrute as top pick when no category filter specified
    let topPick = candidatesWithEquipment[0] || null;
    if (!categoryFilter) {
      const windshieldPick = candidatesWithEquipment.find((c) =>
        (c.category?.toLowerCase() || inferTypeCodeFromRecord(c as unknown as GlassRecord)) === "frontrute"
      );
      if (windshieldPick) {
        topPick = windshieldPick;
      }
    }

    // Determine confidence level
    const topCandidate = topPick || candidatesWithEquipment[0];
    if (factoryEquipment && topCandidate && confidence !== "exact") {
      const topEq = topCandidate._equipment || inferRecordEquipment(topCandidate);
      const allMatch =
        factoryEquipment.adas === topEq.adas &&
        factoryEquipment.rainSensor === topEq.rainSensor &&
        factoryEquipment.heated === topEq.heated &&
        factoryEquipment.acoustic === topEq.acoustic &&
        factoryEquipment.antenna === topEq.antenna &&
        factoryEquipment.camera === topEq.camera &&
        factoryEquipment.hud === topEq.hud;
      if (allMatch && confidence === "high") {
        confidence = "exact";
      }
    }

    // Save kType→eurocode mapping
    if (vehicle.k_type > 0 && topCandidate) {
      await insertKtypeMatch(db, vehicle.k_type, topCandidate.eurocode);
    }

    // Learning Engine: save search result
    if (topCandidate) {
      const regnrHash = await sha256(regnr);
      await saveSearchResult(db, {
        regnr_hash: regnrHash,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        generation: unifiedVin?.generation || parseGenerationFromDescription(vehicle.model) || undefined,
        body: unifiedVin?.body || svvBody.bodyType || undefined,
        chosen_eurocode: topCandidate.eurocode,
        equipment: {
          adas: effectiveEquipment.adas,
          rainSensor: effectiveEquipment.rainSensor,
          heated: effectiveEquipment.heated,
          acoustic: effectiveEquipment.acoustic,
          antenna: effectiveEquipment.antenna,
          hud: effectiveEquipment.hud,
          camera: effectiveEquipment.camera,
          shade: (topCandidate._equipment || inferRecordEquipment(topCandidate)).shade,
        },
        layer,
        confidence,
        source: equipSource,
        vin_prefix: vehicle.vin ? vehicle.vin.slice(0, 6).toUpperCase() : undefined,
      });
    }

    return {
      httpStatus: 200,
      body: {
        vehicle: {
          regnr: vehicle.regno,
          vin: vehicle.vin,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          kType: vehicle.k_type,
          typeCode: vehicle.typeCode,
          length: vehicle.length,
          fuelCode: vehicle.fuelCode,
          engineCode: vehicle.engineCode,
          seats: vehicle.seats,
          gvwr: vehicle.gvwr,
          vinDecode: vinInfo,
          unifiedVin,
          svvBody,
          bovsoft: bovsoftVehicle
            ? {
                ktype: bovsoftVehicle.ktype,
                brand: bovsoftVehicle.brand,
                model: bovsoftVehicle.model,
                yearFrom: bovsoftVehicle.yearFrom,
                yearTo: bovsoftVehicle.yearTo,
                body: bovsoftVehicle.body,
              }
            : null,
          factoryEquipment: factoryEquipment
            ? {
                rainSensor: factoryEquipment.rainSensor,
                heated: factoryEquipment.heated,
                acoustic: factoryEquipment.acoustic,
                adas: factoryEquipment.adas,
                camera: factoryEquipment.camera,
                antenna: factoryEquipment.antenna,
                hud: factoryEquipment.hud,
                source: factoryEquipment.source,
              }
            : null,
          guessedEquipment: guessedEquipment.confidence !== "none"
            ? {
                adas: guessedEquipment.adas,
                rainSensor: guessedEquipment.rainSensor,
                heated: guessedEquipment.heated,
                acoustic: guessedEquipment.acoustic,
                antenna: guessedEquipment.antenna,
                camera: guessedEquipment.camera,
                hud: guessedEquipment.hud,
                shade: guessedEquipment.shade,
                confidence: guessedEquipment.confidence,
                source: guessedEquipment.source,
              }
            : null,
          effectiveEquipment: {
            rainSensor: effectiveEquipment.rainSensor,
            heated: effectiveEquipment.heated,
            acoustic: effectiveEquipment.acoustic,
            adas: effectiveEquipment.adas,
            camera: effectiveEquipment.camera,
            antenna: effectiveEquipment.antenna,
            hud: effectiveEquipment.hud,
            source: effectiveEquipment.source,
            guessed: effectiveEquipment.guessed,
            guessConfidence: effectiveEquipment.guessConfidence,
          },
        },
        candidates: candidatesWithEquipment,
        top_pick: topPick,
        confidence,
        layer,
        cache_hit: svvCacheHit,
        _debug: {
          l1Total: debugL1Total,
          l1Compatible: debugL1Compatible,
          l1Model: debugL1Model,
          l3Total: debugL3Total,
          l3Compatible: debugL3Compatible,
          l3bTotal: debugL3bTotal,
          l3bCompatible: debugL3bCompatible,
          l3bModel: debugL3bModel,
          fuzzyCount: debugFuzzyCount,
          totalCandidatesBeforeScoring: candidates.length,
          tecdocFallback: ktypeSource === "tecdoc_fallback",
          familyMatch: debugFamilyMatch,
        },
        confidenceInfo: {
          score: layer === -1 ? 100 : layer === 0 ? 95 : layer === 1 ? 85 : layer === 2 ? 65 : layer === 3 ? 45 : 25,
          label: confidence,
          reasons: layer === -1
            ? ["Verifisert i ground truth database (auto-glass.no)"]
            : layer === 0
              ? ktypeSource === "tecdoc_fallback"
                ? ["Eksakt match på kType fra TecDoc (fallback-data)"]
                : ["Eksakt match på kType fra TecDoc"]
              : layer === 1
                ? ["Match på merke, modell og årsmodell"]
                : layer === 2
                  ? debugFamilyMatch && debugFamilyMatch.found > 0
                    ? ["Match på kjøretøyfamilie (ikke eksakt modell)", "Verifiser utstyr før bestilling"]
                    : ["Match på merke og årsmodell", "Verifiser modell før bestilling"]
                  : layer === 3
                    ? ["Kun match på merke", "Sterkt anbefalt å verifisere modell og år"]
                    : ["Begrenset data tilgjengelig"],
          layer,
          groundTruth: layer === -1,
        },
        resultsByType: groupByTypeCode(candidatesWithEquipment as unknown as GlassRecord[]),
        equipmentFilter: hasUserEquipment
          ? {
              applied: true,
              answers: userEquipmentAnswers,
              exactCount: exactWithEquipment.length,
              uncertainCount: uncertainWithEquipment.length,
              showingUncertainFallback: showUncertainAsFallback,
              message:
                exactWithEquipment.length === 0
                  ? "Ingen eksakte treff med valgte utstyr. Viser usikre alternativer."
                  : undefined,
            }
          : { applied: false },
        prefix4Hints: (() => {
          const counts = new Map<string, number>();
          candidatesWithEquipment.forEach((c: any) => {
            const p = c.prefix4;
            if (p) counts.set(p, (counts.get(p) || 0) + 1);
          });
          return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([prefix4, count]) => ({ prefix4, count }));
        })(),
        calibrationRequirements: await queryCalibrationRequirements(
          db,
          vehicle.make,
          vehicle.model,
          vehicle.year
        ),
        ktypeInfo: ktypeRegistryInfo,
        sources: [source, bovsoftVehicle ? "bovsoft" : ktypeSource === "tecdoc_fallback" ? "tecdoc_fallback" : "none", effectiveEquipment.source],
        legacyWarning: isLegacy && (!svvTecdocMatch || svvTecdocMatch.confidence_level === 'none')
          ? "Dette kjøretøyet er registrert som eldre/klassisk modell. Resultatene kan være begrenset."
          : undefined,
      },
    };
  } catch (e) {
    console.error(`searchByRegnr exception for ${regnr}: ${e instanceof Error ? e.message : String(e)}`);
    return {
      httpStatus: 500,
      body: { error: "En intern feil oppstod under søket. Prøv igjen senere.", regnr, code: "internal_error" },
    };
  }
}

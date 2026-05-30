/**
 * Main search orchestrator: regnr → SVV → kType → D1 candidates → scoring → response.
 */

import type { Env, GlassRecord, SearchResult, BovsoftVehicle, GroundTruthRecord } from "../types";
import type { TecdocVehicle, SvvFetchResult } from "../providers/svv";
import { fetchSvvEnkeltoppslag } from "../providers/svv";
import { getCachedSvvVehicle, cacheSvvVehicle } from "../lib/svv-cache";
import { getCachedBovsoftVehicle, fetchBovsoftVehicle, cacheBovsoftVehicle } from "../lib/bovsoft";
import { normalizeBrand, getBrandAliases } from "../lib/brand";
import {
  queryByEurocode,
  queryVehicleFingerprint,
  queryByBrandAndYear,
  queryByBrandOnly,
  queryByKtype,
  queryKtypeRegistry,
  queryKtypeMapping,
  insertKtypeMatch,
  queryCalibrationRequirements,
  queryGroundTruth,
  queryGroundTruthByVehicle,
  queryFuzzyBrandYear,
  queryTecdocByKtype,
  queryTecdocKtypeByVehicle,
  KTYPE_CONFIDENCE_THRESHOLD,
} from "../lib/db";
import { fetchBiluppgifterEquipment, inferRecordEquipment, detectFlagsFromOem } from "../lib/equipment";
import { decodeVwTransporterBody, decodeVin, inferBodyFromSvvData } from "../lib/vin-decoder";
import { parseGenerationFromDescription } from "../lib/generation";
import { scoreCandidate, modelMatches, yearCompatible, guessEquipment } from "../lib/scoring";
import { groundTruthToCandidates, inferTypeCodeFromRecord, groupByTypeCode } from "../lib/ground-truth";
import { sha256, saveSearchResult, getLearnedEquipment, getLearnedByVinPrefix } from "../lib/learning";
import { normalizeRecord } from "../lib/normalize";
import { lookupNagsByVehicle } from "../nags-by-vehicle";
import { resolveGlass, upsertGlassRule } from "../vin-glass-resolver";

export type { SearchResult };

export async function searchByRegnr(regnr: string, env: Env, categoryFilter?: string): Promise<SearchResult> {
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
    let source = "svv.enkeltoppslag";

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
            body: { error: "Kjøretøyoppslag midlertidig utilgjengelig", regnr, code: "svv_auth_error" },
          };
        case "upstream_error":
        case "parse_error":
          return {
            httpStatus: 503,
            retryAfter: 60,
            body: { error: "Kjøretøyoppslag midlertidig utilgjengelig", regnr, code: "svv_upstream_error" },
          };
        case "not_found":
        default:
          return {
            httpStatus: 404,
            body: { error: "Kunne ikke slå opp registreringsnummer", regnr },
          };
      }
    }

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

    // 2. Check ground_truth database FIRST (layer -1)
    let groundTruth: GroundTruthRecord | null = null;
    let gtCandidates: GlassRecord[] = [];
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

    // 3b. Bovsoft kType
    let bovsoftVehicle: BovsoftVehicle | null = null;
    let bovsoftError: string | null = null;
    if (!resolvedKtype) {
      bovsoftVehicle = await getCachedBovsoftVehicle(env.GLASS_CATALOG, regnr);
      if (!bovsoftVehicle && env.BOVSOFT_CLIENT_ID && env.BOVSOFT_SECCODE && env.BOVSOFT_CLIENT_ID !== "NOT_SET") {
        try {
          bovsoftVehicle = await fetchBovsoftVehicle(regnr, env.BOVSOFT_CLIENT_ID, env.BOVSOFT_SECCODE);
          if (bovsoftVehicle) {
            await cacheBovsoftVehicle(env.GLASS_CATALOG, regnr, bovsoftVehicle);
          }
        } catch (e) {
          bovsoftError = e instanceof Error ? e.message : String(e);
        }
      }
      if (bovsoftVehicle && bovsoftVehicle.ktype > 0) {
        resolvedKtype = bovsoftVehicle.ktype;
        ktypeSource = "bovsoft";
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

    // 3d. Cross-validate brand
    if (bovsoftVehicle && bovsoftVehicle.brand && vehicle.make) {
      const bovBrand = bovsoftVehicle.brand.toLowerCase().replace(/[^a-z]/g, "");
      const svvBrand = vehicle.make.toLowerCase().replace(/[^a-z]/g, "");
      if (bovBrand !== svvBrand && !bovBrand.includes(svvBrand) && !svvBrand.includes(bovBrand)) {
        console.warn(`Brand mismatch for ${regnr}: SVV=${vehicle.make}, Bovsoft=${bovsoftVehicle.brand}`);
      }
    }

    // 3e. Merge kType into vehicle + save to glass_rules
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

    // 3f. Save SVV vehicle data to vin_decode_cache
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

    // === Layer -1: Ground truth ===
    if (gtCandidates.length > 0) {
      candidates.push(...gtCandidates);
      gtCandidates.forEach((c) => candidateCodes.add(c.eurocode));
      layer = -1;
      confidence = "exact";
    }

    // === Layer 0: kType exact match ===
    if (layer !== -1 && vehicle.k_type > 0) {
      const ktypeDirect = await queryByKtype(db, vehicle.k_type);
      for (const c of ktypeDirect) {
        if (!candidateCodes.has(c.eurocode)) {
          candidates.push(c);
          candidateCodes.add(c.eurocode);
        }
      }
      if (ktypeDirect.length > 0) {
        layer = 0;
        confidence = "exact";
      }

      if (ktypeDirect.length === 0) {
        const ktypeMappings = await queryKtypeMapping(db, vehicle.k_type);
        if (ktypeMappings.length > 0) {
          const topMapping = ktypeMappings[0];
          if (topMapping.frequency >= KTYPE_CONFIDENCE_THRESHOLD) {
            const mappedRecord = await queryByEurocode(db, topMapping.eurocode);
            if (mappedRecord && !candidateCodes.has(mappedRecord.eurocode)) {
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
    if (layer !== -1 && layer > 0) {
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
          for (const c of ktypeDirect) {
            if (!candidateCodes.has(c.eurocode)) {
              candidates.push(c);
              candidateCodes.add(c.eurocode);
            }
          }
          if (ktypeDirect.length > 0) {
            layer = 0;
            confidence = "exact";
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

    if (layer !== -1) {
      let modelHint = vehicle.model.length >= 3 ? vehicle.model.toLowerCase() : undefined;
      let extraHints: string[] | undefined;
      if (vehicle.make.toLowerCase().includes("volkswagen")) {
        const vwVariants = ["transporter", "multivan", "caravelle", "california"];
        if (vwVariants.some((v) => vehicle.model.toLowerCase().includes(v))) {
          extraHints = vwVariants.filter((v) => !vehicle.model.toLowerCase().includes(v));
        }
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
      const l1Deduped = l1All.filter((r) => { if (seen.has(r.eurocode)) return false; seen.add(r.eurocode); return true; });
      debugL1Total = l1Deduped.length;

      const l1Compatible = l1Deduped.filter((r) => yearCompatible(r, vehicle.year, vehicle.make, vehicle.model));
      const l1Model = l1Compatible.filter((r) => modelMatches(vehicle.model, r.model, vehicle.make));
      debugL1Compatible = l1Compatible.length;
      debugL1Model = l1Model.length;

      if (l1Model.length > 0) {
        for (const c of l1Model) {
          if (!candidateCodes.has(c.eurocode)) {
            candidates.push(c);
            candidateCodes.add(c.eurocode);
          }
        }
        if (layer > 1) { layer = 1; confidence = "high"; }
      } else if (l1Compatible.length > 0) {
        for (const c of l1Compatible) {
          if (!candidateCodes.has(c.eurocode)) {
            candidates.push(c);
            candidateCodes.add(c.eurocode);
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
        const l3Deduped = l3All.filter((r) => { if (seen3.has(r.eurocode)) return false; seen3.add(r.eurocode); return true; });
        const l3Compatible = l3Deduped.filter((r) => yearCompatible(r, vehicle.year, vehicle.make, vehicle.model));
        if (l3Compatible.length > 0) {
          for (const c of l3Compatible) {
            if (!candidateCodes.has(c.eurocode)) {
              candidates.push(c);
              candidateCodes.add(c.eurocode);
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
              if (!candidateCodes.has(c.eurocode)) {
                candidates.push(c);
                candidateCodes.add(c.eurocode);
              }
            }
            if (layer > 3) { layer = 3; confidence = "medium"; }
          } else if (l3bCompatible.length > 0) {
            for (const c of l3bCompatible) {
              if (!candidateCodes.has(c.eurocode)) {
                candidates.push(c);
                candidateCodes.add(c.eurocode);
              }
            }
            if (layer > 3) { layer = 3; confidence = "low"; }
          }
        }
      }
    }

    // === Layer 5: Fuzzy Brand+Year fallback ===
    const hasWindshield = candidates.some((c) => c.category === "frontrute");
    const hasEnoughResults = candidates.length >= 15;
    if (!hasEnoughResults || !hasWindshield) {
      const fuzzyResults = await queryFuzzyBrandYear(db, vehicle.make, vehicle.year, vehicle.model, 50);
      debugFuzzyCount = fuzzyResults.length;
      for (const { record, score } of fuzzyResults) {
        if (!candidateCodes.has(record.eurocode)) {
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

    // Score and sort
    const scored = candidates
      .map((c) => ({ c, score: scoreCandidate(c, vehicleFlags, vehicle, vinInfo, bovsoftVehicle || undefined, unifiedVin || undefined, dominantPrefix4) }))
      .sort((a, b) => b.score - a.score);

    // Optional category filter
    const filteredScored = categoryFilter
      ? scored.filter((s) => {
          const cat = s.c.category?.toLowerCase() || inferTypeCodeFromRecord(s.c);
          return cat === categoryFilter.toLowerCase();
        })
      : scored;

    // Top-per-type selection
    const MAX_PER_TYPE = 3;
    const MAX_TOTAL = 30;

    const byType = new Map<string, typeof filteredScored>();
    for (const s of filteredScored) {
      const code = s.c.typeCode || inferTypeCodeFromRecord(s.c) || "UNKNOWN";
      if (!byType.has(code)) byType.set(code, []);
      byType.get(code)!.push(s);
    }

    const selected: typeof filteredScored = [];
    let round = 0;
    while (selected.length < MAX_TOTAL) {
      let addedInRound = 0;
      for (const [, list] of byType) {
        if (list[round] && selected.length < MAX_TOTAL) {
          selected.push(list[round]);
          addedInRound++;
        }
      }
      if (addedInRound === 0 || round >= MAX_PER_TYPE - 1) break;
      round++;
    }

    const candidatesWithEquipment = selected.map((s) => {
      const record = s.c;
      const nagsCodes = lookupNagsByVehicle(
        record.brand || '',
        record.model || '',
        record.year_from,
        record.year_to,
        record.category || inferTypeCodeFromRecord(record) || 'annet'
      );
      return {
        ...normalizeRecord(record),
        _score: s.score,
        _equipment: inferRecordEquipment(record),
        nagsCodes: nagsCodes.length > 0 ? nagsCodes : undefined,
      };
    });

    const topPick = candidatesWithEquipment[0] || null;

    // Determine confidence level
    const topCandidate = candidatesWithEquipment[0];
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
          bovsoftConfigured: !!(env.BOVSOFT_CLIENT_ID && env.BOVSOFT_CLIENT_ID !== "NOT_SET"),
          bovsoftFetched: !!bovsoftVehicle,
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
                  ? ["Match på merke og årsmodell", "Verifiser modell før bestilling"]
                  : layer === 3
                    ? ["Kun match på merke", "Sterkt anbefalt å verifisere modell og år"]
                    : ["Begrenset data tilgjengelig"],
          layer,
          groundTruth: layer === -1,
        },
        resultsByType: groupByTypeCode(candidatesWithEquipment as unknown as GlassRecord[]),
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

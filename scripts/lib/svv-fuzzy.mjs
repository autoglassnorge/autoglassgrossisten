/**
 * SVV → TecDoc fuzzy matching orchestrator.
 *
 * Orchestrates the full pipeline:
 *   regnr → SVV Enkeltoppslag → vehicle extraction → brand/model normalization
 *   → TecDoc kType resolver → confidence scoring → result object.
 */

import { fetchSvvEnkeltoppslag } from './svv-client-standalone.mjs';
import { resolveTecDocKType } from './tecdoc-resolver-standalone.mjs';
import { normalizeBrand } from './brand-standalone.mjs';

/**
 * @typedef {import('./svv-client-standalone.mjs').TecdocVehicle} TecdocVehicle
 * @typedef {import('./svv-client-standalone.mjs').SvvFetchResult} SvvFetchResult
 * @typedef {import('./tecdoc-resolver-standalone.mjs').TecDocResult} TecDocResult
 */

/**
 * Run the full SVV → TecDoc fuzzy matching pipeline for a single regnr.
 *
 * @param {string} regnr
 * @param {string} svvApiKey
 * @returns {Promise<{
 *   regnr: string;
 *   svvStatus: string;
 *   vehicle: TecdocVehicle | null;
 *   normalizedMake: string;
 *   normalizedModel: string;
 *   tecdocResult: TecDocResult | null;
 *   confidenceScore: number;
 *   confidenceLevel: string;
 *   matchReasons: string[];
 *   createdAt: string;
 * }>}
 */
export async function runFuzzyMatch(regnr, svvApiKey) {
  const startedAt = new Date().toISOString();

  try {
    const svvResult = await fetchSvvEnkeltoppslag(regnr, svvApiKey);

    if (svvResult.status !== 'ok') {
      return {
        regnr,
        svvStatus: svvResult.status,
        vehicle: null,
        normalizedMake: '',
        normalizedModel: '',
        tecdocResult: null,
        confidenceScore: 0,
        confidenceLevel: 'none',
        matchReasons: [`SVV failed: ${svvResult.status}`],
        createdAt: startedAt,
      };
    }

    const vehicle = svvResult.vehicle;
    const normalizedMake = normalizeBrand(vehicle.make);
    const normalizedModel = vehicle.model.toUpperCase().trim();

    // await defensively: works for both sync and async resolver implementations
    const tecdocResult = await resolveTecDocKType(normalizedMake, normalizedModel, vehicle.year);

    let confidenceScore = 0;
    let matchReasons = [];

    if (tecdocResult.candidates.length === 0) {
      confidenceScore = 0;
      matchReasons = ['No TecDoc candidates found'];
    } else {
      const best = tecdocResult.candidates[0];
      confidenceScore = best.score;
      matchReasons = best.reasons;
    }

    // Confidence mapping relies on resolver thresholds:
   // 'resolved' requires bestScore >= 0.75, 'ambiguous' requires >= 0.4
    // Keep in sync with tecdoc-resolver-standalone.mjs
    let confidenceLevel;
    if (tecdocResult.status === 'resolved') {
      confidenceLevel = 'exact';
    } else if (tecdocResult.status === 'ambiguous') {
      confidenceLevel = 'high';
    } else if (confidenceScore >= 0.4) {
      confidenceLevel = 'medium';
    } else if (confidenceScore >= 0.15) {
      confidenceLevel = 'low';
    } else {
      confidenceLevel = 'none';
    }

    return {
      regnr,
      svvStatus: svvResult.status,
      vehicle,
      normalizedMake,
      normalizedModel,
      tecdocResult,
      confidenceScore,
      confidenceLevel,
      matchReasons,
      createdAt: startedAt,
    };
  } catch (err) {
    return {
      regnr,
      svvStatus: 'exception',
      vehicle: null,
      normalizedMake: '',
      normalizedModel: '',
      tecdocResult: null,
      confidenceScore: 0,
      confidenceLevel: 'none',
      matchReasons: [`Pipeline exception: ${err instanceof Error ? err.message : String(err)}`],
      createdAt: startedAt,
    };
  }
}

/**
 * Rule-based AI Glass Guide — tilstandsløs wizard som hjelper mekanikere
 * å velge riktig glass gjennom 3–5 smarte spørsmål.
 */

import type { Env, GlassRecord, GuideQuestion, GuideState } from "../types";
import { jsonResponse, errorResponse } from "../lib/cors";
import { searchByRegnr } from "./search";
import { inferRecordEquipment } from "../lib/equipment";
import { llmGuideGlass } from "../lib/llm";
import { decodeVin } from "../lib/vin-decoder";
import { queryByBrandAndYear, queryByBrandOnly } from "../lib/db";
import { normalizeRecord } from "../lib/normalize";

/** Felt som kan brukes til spørsmålsgenerering */
type FilterableField =
  | "position"
  | "adas"
  | "rainSensor"
  | "heated"
  | "acoustic"
  | "antenna"
  | "camera"
  | "hud"
  | "shade"
  | "green"
  | "blue";

interface GuideRequest {
  regnr?: string;
  vin?: string;
  step: number;
  answers: Record<string, string>;
  categoryFilter?: string;
  mode?: "rule" | "llm";
}

/** Hjelpere for å lese equipment fra properties (normalisert av normalizeRecord) */
function getProp(c: GlassRecord, key: string): unknown {
  const props = (c.properties as Record<string, unknown>) || {};
  return props[key];
}

/** Sjekk om kandidater har variasjon i et gitt felt */
function hasVariation(
  candidates: GlassRecord[],
  field: FilterableField
): boolean {
  const values = new Set<string>();
  for (const c of candidates) {
    let val: string | null = null;
    switch (field) {
      case "position":
        val = c.position ?? null;
        break;
      case "adas":
        val = String(!!getProp(c, "adas"));
        break;
      case "rainSensor":
        val = String(!!getProp(c, "rainSensor"));
        break;
      case "heated":
        val = String(!!getProp(c, "heated"));
        break;
      case "acoustic":
        val = String(!!getProp(c, "acoustic"));
        break;
      case "antenna":
        val = String(!!getProp(c, "antenna"));
        break;
      case "camera":
        val = String(!!getProp(c, "camera"));
        break;
      case "hud":
        val = String(!!getProp(c, "hud"));
        break;
      case "shade":
        val = String(!!getProp(c, "shade"));
        break;
      case "green":
        val = String(!!getProp(c, "green"));
        break;
      case "blue":
        val = String(!!getProp(c, "blue"));
        break;
    }
    if (val !== null) values.add(val);
    if (values.size > 1) return true;
  }
  return values.size > 1;
}

/** Bygg spørsmål for et felt */
function buildQuestion(
  field: FilterableField,
  candidates: GlassRecord[]
): GuideQuestion {
  switch (field) {
    case "position": {
      const hasDriver = candidates.some((c) => c.position === "driver");
      const hasPassenger = candidates.some((c) => c.position === "passenger");
      const hasBoth = candidates.some((c) => c.position === "both");
      const options: { value: string; label: string }[] = [];
      if (hasDriver) options.push({ value: "driver", label: "Fører (venstre)" });
      if (hasPassenger)
        options.push({ value: "passenger", label: "Passasjer (høyre)" });
      if (hasBoth) options.push({ value: "both", label: "Begge sider" });
      return {
        id: "position",
        type: "single_choice",
        label: "Hvilken side?",
        options,
        reason:
          "Vi fant flere glass med ulike sider. Velg hvilken side glasset skal monteres på.",
      };
    }
    case "adas":
      return {
        id: "adas",
        type: "boolean",
        label: "Har bilen ADAS / filskiftevarsel?",
        options: [
          { value: "true", label: "Ja, ADAS-kamera" },
          { value: "false", label: "Nei, ingen ADAS" },
        ],
        reason:
          "Frontruter med ADAS har et spesielt monteringspunkt for kameraet. Feil glass kan gi feilkoder.",
      };
    case "rainSensor":
      return {
        id: "rainSensor",
        type: "boolean",
        label: "Har bilen regnsensor?",
        options: [
          { value: "true", label: "Ja, regnsensor" },
          { value: "false", label: "Nei, ingen regnsensor" },
        ],
        reason:
          "Regnsensoren krever et spesielt område på frontruten. Sjekk om bilen har automatisk vindusvisker.",
      };
    case "heated":
      return {
        id: "heated",
        type: "boolean",
        label: "Har bilen oppvarmet frontrute?",
        options: [
          { value: "true", label: "Ja, oppvarmet" },
          { value: "false", label: "Nei, standard" },
        ],
        reason:
          "Oppvarmet frontrute har elektriske ledere i glasset. Uten varme blir det tåkete om vinteren.",
      };
    case "acoustic":
      return {
        id: "acoustic",
        type: "boolean",
        label: "Ønsker du akustisk glass?",
        options: [
          { value: "true", label: "Ja, akustisk (støydempet)" },
          { value: "false", label: "Nei, standard" },
        ],
        reason:
          "Akustisk glass reduserer støy med opptil 3 dB. Mange premium-biler har dette som standard.",
      };
    case "antenna":
      return {
        id: "antenna",
        type: "boolean",
        label: "Har bilen antenne i frontruten?",
        options: [
          { value: "true", label: "Ja, integrert antenne" },
          { value: "false", label: "Nei, egen antenne" },
        ],
        reason:
          "Noen frontruter har integrert FM/DAB-antenne. Sjekk om det er ledninger i den gamle ruten.",
      };
    case "camera":
      return {
        id: "camera",
        type: "boolean",
        label: "Har bilen kamera i frontruten?",
        options: [
          { value: "true", label: "Ja, frontkamera" },
          { value: "false", label: "Nei, ingen kamera" },
        ],
        reason:
          "Frontkamera krever spesiell plassering og eventuelt kalibrering etter ruteskift.",
      };
    case "hud":
      return {
        id: "hud",
        type: "boolean",
        label: "Har bilen Head-Up Display (HUD)?",
        options: [
          { value: "true", label: "Ja, HUD" },
          { value: "false", label: "Nei, ingen HUD" },
        ],
        reason:
          "HUD krever en spesiell type frontrute med coating som reflekterer projeksjonen.",
      };
    case "shade": {
      const hasShade = candidates.some((c) => c.shade);
      const hasNoShade = candidates.some((c) => !c.shade);
      return {
        id: "shade",
        type: "boolean",
        label: "Ønsker du solskjerming (shade)?",
        options: [
          { value: "true", label: "Ja, med solskjerming" },
          { value: "false", label: "Nei, standard" },
        ],
        reason: hasShade && hasNoShade
          ? "Noen varianter har solskjerming i toppen av frontruten."
          : "",
      };
    }
    case "green": {
      const hasGreen = candidates.some(
        (c) => c.properties && (c.properties as Record<string, unknown>).green
      );
      const hasNoGreen = candidates.some(
        (c) => !c.properties || !(c.properties as Record<string, unknown>).green
      );
      return {
        id: "green",
        type: "single_choice",
        label: "Hvilken farge?",
        options: [
          ...(hasGreen ? [{ value: "true", label: "Grønn tint" }] : []),
          ...(hasNoGreen ? [{ value: "false", label: "Klar / blå" }] : []),
        ],
        reason:
          "Grønn tint er vanligst, men noen biler har klar eller blå frontrute.",
      };
    }
    case "blue": {
      return {
        id: "blue",
        type: "boolean",
        label: "Har bilen blå frontrute?",
        options: [
          { value: "true", label: "Ja, blå" },
          { value: "false", label: "Nei, annen farge" },
        ],
        reason: "Blå frontrute er sjelden, men finnes på noen modeller.",
      };
    }
  }
}

/** Filtrer kandidater basert på svar */
function filterCandidates(
  candidates: GlassRecord[],
  answers: Record<string, string>
): GlassRecord[] {
  return candidates.filter((c) => {
    for (const [field, answer] of Object.entries(answers)) {
      let match = false;
      switch (field) {
        case "position":
          match = c.position === answer;
          break;
        case "adas":
          match = String(!!getProp(c, "adas")) === answer;
          break;
        case "rainSensor":
          match = String(!!getProp(c, "rainSensor")) === answer;
          break;
        case "heated":
          match = String(!!getProp(c, "heated")) === answer;
          break;
        case "acoustic":
          match = String(!!getProp(c, "acoustic")) === answer;
          break;
        case "antenna":
          match = String(!!getProp(c, "antenna")) === answer;
          break;
        case "camera":
          match = String(!!getProp(c, "camera")) === answer;
          break;
        case "hud":
          match = String(!!getProp(c, "hud")) === answer;
          break;
        case "shade":
          match = String(!!getProp(c, "shade")) === answer;
          break;
        case "green":
          match = String(!!getProp(c, "green")) === answer;
          break;
        case "blue":
          match = String(!!getProp(c, "blue")) === answer;
          break;
        default:
          match = true;
      }
      if (!match) return false;
    }
    return true;
  });
}

/** Bestem neste spørsmål basert på variasjoner i kandidater */
function determineNextQuestion(
  candidates: GlassRecord[],
  answers: Record<string, string>
): GuideQuestion | null {
  // Prioritetsrekkefølge: posisjon → ADAS → regnsensor → oppvarmet → akustisk → antenne → kamera → HUD → farge
  const priority: FilterableField[] = [
    "position",
    "adas",
    "rainSensor",
    "heated",
    "acoustic",
    "antenna",
    "camera",
    "hud",
    "shade",
    "green",
  ];

  for (const field of priority) {
    if (answers[field] !== undefined) continue;
    if (hasVariation(candidates, field)) {
      return buildQuestion(field, candidates);
    }
  }

  return null;
}

/** Estimer totalt antall spørsmål (for progress bar) */
function estimateTotalQuestions(
  allCandidates: GlassRecord[],
  answers: Record<string, string>
): number {
  let count = 0;
  const priority: FilterableField[] = [
    "position",
    "adas",
    "rainSensor",
    "heated",
    "acoustic",
    "antenna",
    "camera",
    "hud",
    "shade",
    "green",
  ];
  for (const field of priority) {
    if (answers[field] !== undefined) continue;
    if (hasVariation(allCandidates, field)) count++;
  }
  return Math.max(count, 1);
}

export async function handleGlassGuide(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("Kun POST støttet", 405);
  }

  let body: GuideRequest;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Ugyldig JSON", 400);
  }

  const { regnr, vin, step, answers, categoryFilter } = body;

  if ((!regnr || typeof regnr !== "string") && (!vin || typeof vin !== "string")) {
    return errorResponse("Mangler regnr eller vin", 400);
  }

  try {
    let allCandidates: GlassRecord[] = [];
    let vehicleInfo: { make: string; model: string; year: number } | undefined;
    let confidenceInfo: string | undefined;

    if (vin) {
      // ── VIN-mode: dekod VIN, søk i D1 ──
      const cleanVin = vin.trim().toUpperCase();
      if (cleanVin.length !== 17) {
        return errorResponse("VIN må være 17 tegn", 400);
      }
      if (/[IOQ]/.test(cleanVin)) {
        return errorResponse("VIN kan ikke inneholde I, O eller Q", 400);
      }

      const vinData = decodeVin(cleanVin);
      if (!vinData) {
        return errorResponse("Kunne ikke dekode VIN. Støttede merker: VW, BMW, Mercedes, Audi, Ford, Hyundai, Toyota, Volvo, Nissan, Mazda, Skoda", 400);
      }

      vehicleInfo = {
        make: vinData.make.charAt(0).toUpperCase() + vinData.make.slice(1),
        model: vinData.generation,
        year: vinData.modelYear || new Date().getFullYear(),
      };

      // Søk i D1
      const db = env.GLASS_CATALOG_D1;
      let candidates = await queryByBrandAndYear(db, vinData.make, vehicleInfo.year);
      if (candidates.length === 0) {
        candidates = await queryByBrandOnly(db, vinData.make, vinData.generation);
      }
      allCandidates = candidates.map(normalizeRecord);
      confidenceInfo = "vin_decoded";
    } else if (regnr) {
      // ── Regnr-mode: eksisterende flyt ──
      const searchResult = await searchByRegnr(regnr, env, categoryFilter);

      if (searchResult.httpStatus !== 200) {
        return jsonResponse(
          {
            error: "Søk feilet",
            httpStatus: searchResult.httpStatus,
          },
          searchResult.httpStatus
        );
      }

      const searchBody = searchResult.body as {
        candidates?: GlassRecord[];
        vehicle?: { make: string; model: string; year: number };
        confidence?: string;
      };

      allCandidates = searchBody.candidates || [];
      vehicleInfo = searchBody.vehicle;
      confidenceInfo = searchBody.confidence;
    }

    // 2. Filtrer basert på svar
    let filteredCandidates = filterCandidates(allCandidates, answers || {});

    // 3. Hvis ≤ 3 kandidater: returner anbefaling
    if (filteredCandidates.length <= 3) {
      const state: GuideState = {
        step,
        question: null,
        candidates: filteredCandidates.length,
        progress: { current: step + 1, total: step + 1 },
        recommendation: filteredCandidates.slice(0, 3),
        answers: answers || {},
      };
      return jsonResponse({
        ...state,
        vehicle: vehicleInfo,
        confidence: confidenceInfo,
      });
    }

    // 4. Rule-based spørsmålsgenerering
    const question = determineNextQuestion(filteredCandidates, answers || {});

    // 5. LLM fallback: hvis rule-based ikke klarer (etter 3 steg) eller mode=llm
    const shouldUseLlm =
      body.mode === "llm" ||
      (step >= 3 && (!question || filteredCandidates.length > 5));

    if (shouldUseLlm && vehicleInfo) {
      try {
        const llmResult = await llmGuideGlass(
          env,
          vehicleInfo,
          filteredCandidates,
          answers || {}
        );

        if (llmResult.type === "recommendation") {
          const state: GuideState = {
            step,
            question: null,
            candidates: llmResult.filteredCandidates.length,
            progress: { current: step + 1, total: step + 1 },
            recommendation: llmResult.recommendation || llmResult.filteredCandidates.slice(0, 3),
            answers: answers || {},
          };
          return jsonResponse({
            ...state,
            vehicle: vehicleInfo,
            confidence: confidenceInfo,
          });
        }

        if (llmResult.type === "question" && llmResult.question) {
          const state: GuideState = {
            step,
            question: llmResult.question as GuideQuestion,
            candidates: llmResult.filteredCandidates.length,
            progress: { current: step + 1, total: Math.min(step + 2, 6) },
            answers: answers || {},
          };
          return jsonResponse({
            ...state,
            vehicle: vehicleInfo,
            confidence: confidenceInfo,
          });
        }
      } catch (llmErr) {
        console.error("LLM fallback failed:", llmErr);
        // Fall through to rule-based
      }
    }

    if (!question) {
      // Ingen flere spørsmål, returner topp 3
      const state: GuideState = {
        step,
        question: null,
        candidates: filteredCandidates.length,
        progress: { current: step + 1, total: step + 1 },
        recommendation: filteredCandidates.slice(0, 3),
        answers: answers || {},
      };
      return jsonResponse({
        ...state,
        vehicle: vehicleInfo,
        confidence: confidenceInfo,
      });
    }

    // 6. Returner rule-based spørsmål
    const totalQuestions = estimateTotalQuestions(allCandidates, answers || {});
    const state: GuideState = {
      step,
      question,
      candidates: filteredCandidates.length,
      progress: {
        current: step + 1,
        total: Math.min(totalQuestions + 1, 5),
      },
      answers: answers || {},
    };

    return jsonResponse({
      ...state,
      vehicle: vehicleInfo,
      confidence: confidenceInfo,
    });
  } catch (e) {
    console.error(
      `handleGlassGuide error: ${e instanceof Error ? e.message : String(e)}`
    );
    return errorResponse("Intern feil i glassveileder", 500);
  }
}

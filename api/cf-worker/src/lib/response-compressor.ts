/**
 * Response compression with field selection for API optimization.
 * Reduces payload size by filtering fields and limiting candidates.
 */

export interface CompressOptions {
  /** Include debug information in response */
  includeDebug?: boolean;
  /** Include detailed equipment information */
  includeEquipmentDetails?: boolean;
  /** Maximum number of candidates to return */
  maxCandidates?: number;
  /** Specific fields to include (whitelist) */
  fields?: string[];
}

/** Default candidate fields when using field selection */
const DEFAULT_CANDIDATE_FIELDS = [
  "eurocode",
  "brand",
  "model",
  "yearFrom",
  "yearTo",
  "category",
  "typeCode",
  "typeCodeDesc",
  "position",
  "price",
  "description",
  "_score",
  "_uncertain",
  "properties",
  "equipmentMatch",
  "equipmentDiff",
];

/** Default vehicle fields when using field selection */
const DEFAULT_VEHICLE_FIELDS = [
  "regnr",
  "make",
  "model",
  "year",
  "kType",
  "typeCode",
];

/** Essential equipment fields to always keep */
const ESSENTIAL_EQUIPMENT_FIELDS = [
  "adas",
  "rainSensor",
  "heated",
  "source",
];

/**
 * Parse the fields query parameter into an array of field names.
 * Supports comma-separated values.
 */
export function parseFieldsParam(param: string | null): string[] | undefined {
  if (!param || param.trim() === "") return undefined;
  return param
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

/**
 * Pick only specified fields from an object.
 */
function pickFields<T extends Record<string, unknown>>(
  obj: T,
  fields: string[]
): Partial<T> {
  const result: Partial<T> = {};
  for (const field of fields) {
    if (field in obj) {
      (result as Record<string, unknown>)[field] = obj[field];
    }
  }
  return result;
}

/**
 * Compress equipment object to only essential fields.
 */
function compressEquipment(
  equipment: Record<string, unknown> | null | undefined,
  includeDetails: boolean
): Record<string, unknown> | null {
  if (!equipment) return null;

  if (includeDetails) {
    return equipment;
  }

  // Only keep essential fields
  const compressed: Record<string, unknown> = {};
  for (const field of ESSENTIAL_EQUIPMENT_FIELDS) {
    if (field in equipment) {
      compressed[field] = equipment[field];
    }
  }
  return compressed;
}

/**
 * Compress a single candidate record.
 */
function compressCandidate(
  candidate: Record<string, unknown>,
  fields: string[] | undefined,
  includeEquipmentDetails: boolean
): Record<string, unknown> {
  // Determine which fields to keep
  const fieldsToKeep = fields || DEFAULT_CANDIDATE_FIELDS;

  // Start with basic field filtering
  let compressed = pickFields(candidate, fieldsToKeep);

  // Handle _equipment separately
  if ("_equipment" in candidate && !includeEquipmentDetails) {
    const equip = candidate._equipment as Record<string, unknown> | undefined;
    if (equip) {
      (compressed as Record<string, unknown>)._equipment = compressEquipment(
        equip,
        false
      );
    }
  }

  return compressed;
}

/**
 * Compress vehicle object to reduce size.
 */
function compressVehicle(
  vehicle: Record<string, unknown>,
  fields: string[] | undefined,
  includeEquipmentDetails: boolean
): Record<string, unknown> {
  const fieldsToKeep = fields || DEFAULT_VEHICLE_FIELDS;

  // Start with basic field filtering
  let compressed = pickFields(vehicle, fieldsToKeep);

  // Handle equipment sections
  const equipmentFields = [
    "factoryEquipment",
    "guessedEquipment",
    "effectiveEquipment",
  ];

  for (const eqField of equipmentFields) {
    if (eqField in vehicle) {
      const equip = vehicle[eqField] as Record<string, unknown> | null;
      if (equip) {
        (compressed as Record<string, unknown>)[eqField] = compressEquipment(
          equip,
          includeEquipmentDetails
        );
      }
    }
  }

  // Keep bovsoft minimal
  if ("bovsoft" in vehicle && !includeEquipmentDetails) {
    const bovsoft = vehicle.bovsoft as Record<string, unknown> | null;
    if (bovsoft) {
      (compressed as Record<string, unknown>).bovsoft = pickFields(bovsoft, [
        "ktype",
        "brand",
        "model",
        "body",
      ]);
    }
  }

  return compressed;
}

/**
 * Compress confidenceInfo to minimal fields.
 */
function compressConfidenceInfo(
  info: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!info) return undefined;

  return {
    score: info.score,
    label: info.label,
    reasons: info.reasons,
  };
}

/**
 * Main compression function for search response.
 */
export function compressSearchResponse(
  fullResponse: Record<string, unknown>,
  options: CompressOptions
): Record<string, unknown> {
  const {
    includeDebug = false,
    includeEquipmentDetails = false,
    maxCandidates = 20,
    fields,
  } = options;

  const compressed: Record<string, unknown> = {};

  // Copy non-debug top-level fields
  const topLevelFields = [
    "confidence",
    "layer",
    "cache_hit",
    "resultsByType",
    "prefix4Hints",
    "ktypeInfo",
    "equipmentFilter",
    "sources",
  ];

  for (const field of topLevelFields) {
    if (field in fullResponse) {
      compressed[field] = fullResponse[field];
    }
  }

  // Compress vehicle
  if ("vehicle" in fullResponse) {
    compressed.vehicle = compressVehicle(
      fullResponse.vehicle as Record<string, unknown>,
      fields,
      includeEquipmentDetails
    );
  }

  // Compress candidates with limit
  if ("candidates" in fullResponse) {
    const candidates = fullResponse.candidates as Record<string, unknown>[];
    const limitedCandidates = candidates.slice(0, maxCandidates);
    compressed.candidates = limitedCandidates.map((c) =>
      compressCandidate(c, fields, includeEquipmentDetails)
    );
    compressed.candidate_count = candidates.length;
    compressed.candidates_returned = limitedCandidates.length;
  }

  // Compress top_pick
  if ("top_pick" in fullResponse && fullResponse.top_pick) {
    compressed.top_pick = compressCandidate(
      fullResponse.top_pick as Record<string, unknown>,
      fields,
      includeEquipmentDetails
    );
  }

  // Compress confidenceInfo
  if ("confidenceInfo" in fullResponse) {
    compressed.confidenceInfo = compressConfidenceInfo(
      fullResponse.confidenceInfo as Record<string, unknown>
    );
  }

  // Handle calibrationRequirements - keep minimal
  if ("calibrationRequirements" in fullResponse) {
    const reqs = fullResponse.calibrationRequirements;
    if (Array.isArray(reqs)) {
      // Keep only essential fields for each requirement
      compressed.calibrationRequirements = reqs.map((req: Record<string, unknown>) => ({
        sensorType: req.sensorType,
        calibrationRequired: req.calibrationTriggers && (req.calibrationTriggers as string[]).length > 0,
      }));
    } else {
      compressed.calibrationRequirements = reqs;
    }
  }

  // Include debug only if explicitly requested
  if (includeDebug && "_debug" in fullResponse) {
    compressed._debug = fullResponse._debug;
  }

  // Add compression metadata
  compressed._compressed = true;
  if (fields) {
    compressed._fields = fields;
  }

  return compressed;
}
